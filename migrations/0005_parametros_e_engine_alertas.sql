-- =====================================================================
-- Migration 0005 — Parametrização de alertas + engine
-- =====================================================================
-- Adiciona:
--   1. parametros_alerta — limites customizáveis por município (RF-02)
--   2. perfis_usuario — catálogo dos 6 perfis simulados (sem auth ainda)
--   3. evolução da tabela alertas (campos categoria, indicador_chave, mensagem_resumo)
--   4. seed dos parâmetros default para os 645 municípios SP
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Parâmetros de alerta por município (RF-02)
-- ---------------------------------------------------------------------
-- Cada município pode customizar limites de atenção (semáforo amarelo)
-- e crítico (vermelho). Quando vazio, sistema usa defaults da matriz legal.

CREATE TABLE IF NOT EXISTS parametros_alerta (
  cod_ibge        BIGINT NOT NULL,
  indicador       TEXT NOT NULL,           -- 'pessoal' | 'educacao' | 'saude' | 'fundeb_remuneracao' | 'dcl' | 'rcl_queda' | 'resultado_primario' | etc.
  -- Para indicadores de máximo legal (pessoal, dívida): pct_do_limite que dispara
  -- Para indicadores de mínimo legal (educação, saúde, fundeb): folga abaixo do qual alerta
  limite_atencao  NUMERIC,                 -- ex: 90 (90% do limite = atenção)
  limite_critico  NUMERIC,                 -- ex: 95 (95% do limite = crítico)
  ativo           BOOLEAN DEFAULT TRUE,
  observacao      TEXT,                    -- por que esse limite foi customizado
  customizado     BOOLEAN DEFAULT FALSE,   -- false = default, true = município editou
  atualizado_em   TIMESTAMPTZ DEFAULT NOW(),
  atualizado_por  TEXT,                    -- usuário responsável (futuro auth)
  PRIMARY KEY (cod_ibge, indicador)
);

CREATE INDEX IF NOT EXISTS idx_parametros_munic ON parametros_alerta(cod_ibge);

-- ---------------------------------------------------------------------
-- 2. Catálogo de perfis simulados
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS perfis_usuario (
  id          TEXT PRIMARY KEY,          -- 'prefeito' | 'secretario' | 'vereador' | 'controle_interno' | 'camara' | 'publico'
  nome        TEXT NOT NULL,
  descricao   TEXT,
  prioridade  INTEGER DEFAULT 0,         -- ordem no switcher
  cor_destaque TEXT,                     -- hex para badge
  pode_ver_alertas BOOLEAN DEFAULT TRUE,
  pode_criar_providencia BOOLEAN DEFAULT FALSE,
  pode_editar_cadastro BOOLEAN DEFAULT FALSE,
  pode_importar_dados BOOLEAN DEFAULT FALSE,
  pode_ver_audit BOOLEAN DEFAULT FALSE
);

INSERT INTO perfis_usuario (id, nome, descricao, prioridade, cor_destaque,
  pode_ver_alertas, pode_criar_providencia, pode_editar_cadastro, pode_importar_dados, pode_ver_audit) VALUES
  ('publico',          'Público',            'Visualiza dados de transparência sem ação de gestão', 0, '#667085', TRUE, FALSE, FALSE, FALSE, FALSE),
  ('prefeito',         'Prefeito',           'Visão estratégica da situação fiscal, administrativa e dos riscos', 1, '#4eb51f', TRUE, TRUE, TRUE, FALSE, TRUE),
  ('secretario',       'Secretário de Finanças', 'Controle da execução orçamentária, receita, despesa, caixa, metas e limites', 2, '#0f4f8f', TRUE, TRUE, TRUE, TRUE, TRUE),
  ('controle_interno', 'Controle Interno',   'Fiscalização preventiva, conformidade legal, alertas e evidências', 3, '#d97706', TRUE, TRUE, FALSE, FALSE, TRUE),
  ('camara',           'Câmara Municipal',   'Acompanhamento legislativo, emendas, metas e execução autorizada', 4, '#0b2f63', TRUE, FALSE, FALSE, FALSE, FALSE),
  ('vereador',         'Vereador',           'Fiscalização individual e acesso a relatórios sintéticos', 5, '#1d8a43', TRUE, FALSE, FALSE, FALSE, FALSE)
ON CONFLICT (id) DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  prioridade = EXCLUDED.prioridade,
  cor_destaque = EXCLUDED.cor_destaque;

-- ---------------------------------------------------------------------
-- 3. Evolução da tabela alertas (campos derivados úteis pro painel)
-- ---------------------------------------------------------------------

ALTER TABLE alertas ADD COLUMN IF NOT EXISTS categoria TEXT;        -- 'lrf' | 'educacao' | 'saude' | 'fundeb' | 'divida' | 'planejamento' | 'externo'
ALTER TABLE alertas ADD COLUMN IF NOT EXISTS valor_observado NUMERIC;
ALTER TABLE alertas ADD COLUMN IF NOT EXISTS limite_referencia NUMERIC;
ALTER TABLE alertas ADD COLUMN IF NOT EXISTS pct_do_limite NUMERIC;
ALTER TABLE alertas ADD COLUMN IF NOT EXISTS hash_dedup TEXT;       -- evita inserir alerta idêntico duas vezes na mesma rodada
ALTER TABLE alertas ADD COLUMN IF NOT EXISTS fonte_engine TEXT;     -- 'lrf_engine_v1' etc.

CREATE INDEX IF NOT EXISTS idx_alertas_categoria ON alertas(categoria, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_alertas_dedup ON alertas(cod_ibge, hash_dedup) WHERE hash_dedup IS NOT NULL;

-- ---------------------------------------------------------------------
-- 4. Seed parâmetros default para os 645 municípios SP
-- ---------------------------------------------------------------------
-- Defaults baseados nas práticas usuais (LRF prudencial 90% / alerta 95%):

INSERT INTO parametros_alerta (cod_ibge, indicador, limite_atencao, limite_critico, customizado)
SELECT m.cod_ibge, ind.indicador, ind.atencao, ind.critico, FALSE
FROM municipios m
CROSS JOIN (VALUES
  ('pessoal',              90.0, 95.0),   -- % do limite máx (60% RCL Executivo)
  ('educacao',             95.0, 100.0),  -- % do mínimo (25%). 100% = no piso (crítico se cair)
  ('saude',                95.0, 100.0),  -- % do mínimo (15%)
  ('fundeb_remuneracao',   95.0, 100.0),  -- % do mínimo (70%)
  ('dcl',                  85.0, 95.0),   -- % do limite máx (120% RCL)
  ('resultado_primario',   95.0, 100.0),  -- % da meta da LDO
  ('rcl_queda',            5.0,  10.0)    -- % de queda yoy que dispara alerta
) AS ind(indicador, atencao, critico)
ON CONFLICT (cod_ibge, indicador) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5. Função para regenerar alertas de um município (chamada pela engine Python)
-- ---------------------------------------------------------------------
-- A função apaga alertas abertos automáticos (mantém manuais e fechados),
-- depois insere os novos com base nos indicadores atuais.
-- O hash_dedup garante que rodar de novo no mesmo dia não duplica.

CREATE OR REPLACE FUNCTION regerar_alertas_munic(p_cod_ibge BIGINT)
RETURNS INTEGER AS $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  -- Limpa alertas automáticos abertos (a regenerar)
  DELETE FROM alertas
  WHERE cod_ibge = p_cod_ibge
    AND status = 'aberto'
    AND fonte_engine IS NOT NULL;

  -- LRF Pessoal (máximo legal 60% RCL Executivo)
  INSERT INTO alertas (cod_ibge, indicador, exercicio, periodo, nivel, mensagem, base_legal,
                       categoria, valor_observado, limite_referencia, pct_do_limite,
                       hash_dedup, fonte_engine, status)
  SELECT
    p_cod_ibge,
    'pessoal_executivo',
    i.exercicio,
    i.periodo,
    CASE
      WHEN i.pct_do_limite >= COALESCE(p.limite_critico, 95) THEN 'critico'
      WHEN i.pct_do_limite >= COALESCE(p.limite_atencao, 90) THEN 'atencao'
      ELSE 'informativo'
    END,
    'Despesa com pessoal em ' || ROUND(i.valor, 2) || '% da RCL (' || ROUND(i.pct_do_limite, 1) || '% do limite legal de 60%)',
    'LRF Art. 19 III · 60% RCL',
    'lrf',
    i.valor,
    i.limite_legal,
    i.pct_do_limite,
    md5('pessoal_executivo_' || i.exercicio || '_' || i.periodo || '_' || ROUND(i.pct_do_limite, 1)::text),
    'lrf_engine_v1',
    'aberto'
  FROM (
    SELECT * FROM indicadores_lrf
    WHERE cod_ibge = p_cod_ibge AND indicador = 'pessoal'
    ORDER BY exercicio DESC, periodo DESC LIMIT 1
  ) i
  LEFT JOIN parametros_alerta p ON p.cod_ibge = p_cod_ibge AND p.indicador = 'pessoal'
  WHERE i.pct_do_limite >= 80
  ON CONFLICT (cod_ibge, hash_dedup) WHERE hash_dedup IS NOT NULL DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Educação (mínimo constitucional 25% MDE)
  INSERT INTO alertas (cod_ibge, indicador, exercicio, periodo, nivel, mensagem, base_legal,
                       categoria, valor_observado, limite_referencia, pct_do_limite,
                       hash_dedup, fonte_engine, status)
  SELECT
    p_cod_ibge,
    'educacao_mde',
    i.exercicio,
    i.periodo,
    CASE
      WHEN i.valor < i.limite_legal THEN 'critico'
      WHEN i.valor < i.limite_legal * 1.05 THEN 'atencao'
      ELSE 'informativo'
    END,
    'Aplicação em MDE em ' || ROUND(i.valor, 2) || '% (mínimo 25% CF Art. 212)',
    'CF/88 Art. 212 · LDB',
    'educacao',
    i.valor,
    i.limite_legal,
    NULL,
    md5('educacao_mde_' || i.exercicio || '_' || i.periodo || '_' || ROUND(i.valor, 2)::text),
    'lrf_engine_v1',
    'aberto'
  FROM (
    SELECT * FROM indicadores_lrf
    WHERE cod_ibge = p_cod_ibge AND indicador = 'educacao'
    ORDER BY exercicio DESC, periodo DESC LIMIT 1
  ) i
  WHERE i.valor < i.limite_legal * 1.10  -- só alerta se está perto do piso
  ON CONFLICT (cod_ibge, hash_dedup) WHERE hash_dedup IS NOT NULL DO NOTHING;

  -- Saúde (mínimo constitucional 15% ASPS)
  INSERT INTO alertas (cod_ibge, indicador, exercicio, periodo, nivel, mensagem, base_legal,
                       categoria, valor_observado, limite_referencia, pct_do_limite,
                       hash_dedup, fonte_engine, status)
  SELECT
    p_cod_ibge,
    'saude_asps',
    i.exercicio,
    i.periodo,
    CASE
      WHEN i.valor < i.limite_legal THEN 'critico'
      WHEN i.valor < i.limite_legal * 1.05 THEN 'atencao'
      ELSE 'informativo'
    END,
    'Aplicação em saúde em ' || ROUND(i.valor, 2) || '% (mínimo 15% LC 141/2012)',
    'LC 141/2012 Art. 7º',
    'saude',
    i.valor,
    i.limite_legal,
    NULL,
    md5('saude_asps_' || i.exercicio || '_' || i.periodo || '_' || ROUND(i.valor, 2)::text),
    'lrf_engine_v1',
    'aberto'
  FROM (
    SELECT * FROM indicadores_lrf
    WHERE cod_ibge = p_cod_ibge AND indicador = 'saude'
    ORDER BY exercicio DESC, periodo DESC LIMIT 1
  ) i
  WHERE i.valor < i.limite_legal * 1.10
  ON CONFLICT (cod_ibge, hash_dedup) WHERE hash_dedup IS NOT NULL DO NOTHING;

  -- SIOPS ASPS detalhado (quando disponível)
  INSERT INTO alertas (cod_ibge, indicador, exercicio, periodo, nivel, mensagem, base_legal,
                       categoria, valor_observado, limite_referencia, pct_do_limite,
                       hash_dedup, fonte_engine, status)
  SELECT
    p_cod_ibge,
    'siops_asps',
    i.exercicio,
    i.periodo,
    CASE
      WHEN i.valor < 15 THEN 'critico'
      WHEN i.valor < 15.5 THEN 'atencao'
      ELSE 'informativo'
    END,
    'SIOPS reporta ' || ROUND(i.valor, 2) || '% aplicado em saúde (mínimo legal 15%)',
    'LC 141/2012 Art. 7º · SIOPS bimestral',
    'saude',
    i.valor,
    15,
    NULL,
    md5('siops_asps_' || i.exercicio || '_' || i.periodo || '_' || ROUND(i.valor, 2)::text),
    'lrf_engine_v1',
    'aberto'
  FROM (
    SELECT * FROM indicadores_saude
    WHERE cod_ibge = p_cod_ibge AND indicador = 'asps_pct'
    ORDER BY exercicio DESC, periodo DESC LIMIT 1
  ) i
  WHERE i.valor < 16  -- só alerta se está perto/abaixo
  ON CONFLICT (cod_ibge, hash_dedup) WHERE hash_dedup IS NOT NULL DO NOTHING;

  -- FUNDEB remuneração (mínimo 70%)
  INSERT INTO alertas (cod_ibge, indicador, exercicio, periodo, nivel, mensagem, base_legal,
                       categoria, valor_observado, limite_referencia, pct_do_limite,
                       hash_dedup, fonte_engine, status)
  SELECT
    p_cod_ibge,
    'fundeb_remuneracao',
    i.exercicio,
    i.periodo,
    CASE
      WHEN i.valor < 70 THEN 'critico'
      WHEN i.valor < 75 THEN 'atencao'
      ELSE 'informativo'
    END,
    'FUNDEB remuneração de profissionais em ' || ROUND(i.valor, 2) || '% (mínimo 70%)',
    'Lei 14.113/2020 Art. 26',
    'educacao',
    i.valor,
    70,
    NULL,
    md5('fundeb_rem_' || i.exercicio || '_' || ROUND(i.valor, 2)::text),
    'lrf_engine_v1',
    'aberto'
  FROM (
    SELECT * FROM indicadores_educacao
    WHERE cod_ibge = p_cod_ibge AND indicador = 'fundeb_remuneracao_pct'
    ORDER BY exercicio DESC, periodo DESC LIMIT 1
  ) i
  WHERE i.valor < 80
  ON CONFLICT (cod_ibge, hash_dedup) WHERE hash_dedup IS NOT NULL DO NOTHING;

  -- IDEB municipal anos iniciais — queda
  INSERT INTO alertas (cod_ibge, indicador, exercicio, periodo, nivel, mensagem, base_legal,
                       categoria, valor_observado, limite_referencia,
                       hash_dedup, fonte_engine, status)
  SELECT
    p_cod_ibge,
    'ideb_anos_iniciais_queda',
    atual.ciclo_avaliacao,
    NULL,
    CASE WHEN (atual.ideb_observado - anterior.ideb_observado) < -0.5 THEN 'critico'
         WHEN (atual.ideb_observado - anterior.ideb_observado) < -0.2 THEN 'atencao'
         ELSE 'informativo' END,
    'IDEB municipal Anos Iniciais caiu de ' || anterior.ideb_observado || ' (' || anterior.ciclo_avaliacao || ') para ' || atual.ideb_observado || ' (' || atual.ciclo_avaliacao || ')',
    'Lei 9.394/96 (LDB) · Plano Nacional de Educação',
    'educacao',
    atual.ideb_observado,
    anterior.ideb_observado,
    md5('ideb_queda_' || atual.ciclo_avaliacao || '_' || atual.ideb_observado::text),
    'lrf_engine_v1',
    'aberto'
  FROM (
    SELECT * FROM ideb
    WHERE cod_ibge = p_cod_ibge AND rede = 'municipal' AND etapa = 'anos_iniciais'
      AND ideb_observado IS NOT NULL
    ORDER BY ciclo_avaliacao DESC LIMIT 1
  ) atual
  JOIN (
    SELECT * FROM ideb
    WHERE cod_ibge = p_cod_ibge AND rede = 'municipal' AND etapa = 'anos_iniciais'
      AND ideb_observado IS NOT NULL
    ORDER BY ciclo_avaliacao DESC LIMIT 1 OFFSET 1
  ) anterior ON TRUE
  WHERE (atual.ideb_observado - anterior.ideb_observado) < -0.2
  ON CONFLICT (cod_ibge, hash_dedup) WHERE hash_dedup IS NOT NULL DO NOTHING;

  -- Transparência fiscal (publicação SICONFI < 50%)
  INSERT INTO alertas (cod_ibge, indicador, nivel, mensagem, base_legal,
                       categoria, valor_observado, limite_referencia,
                       hash_dedup, fonte_engine, status)
  SELECT
    p_cod_ibge,
    'transparencia_fiscal',
    CASE WHEN pct_publi < 30 THEN 'critico'
         WHEN pct_publi < 60 THEN 'atencao'
         ELSE 'informativo' END,
    'Apenas ' || pct_publi || '% dos relatórios fiscais obrigatórios publicados no SICONFI (' || publicados || ' de ' || total || ')',
    'LRF Art. 48 · transparência fiscal',
    'lrf',
    pct_publi,
    100,
    md5('transparencia_' || pct_publi::text),
    'lrf_engine_v1',
    'aberto'
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE status = 'PUBLICADO')::numeric AS publicados,
      COUNT(*) AS total,
      CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'PUBLICADO') / COUNT(*)) ELSE 0 END AS pct_publi
    FROM publicacao_status
    WHERE cod_ibge = p_cod_ibge
  ) tr
  WHERE tr.total > 0 AND tr.pct_publi < 80
  ON CONFLICT (cod_ibge, hash_dedup) WHERE hash_dedup IS NOT NULL DO NOTHING;

  RETURN v_inserted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION regerar_alertas_munic IS
  'Recomputa alertas automáticos abertos para um município. Idempotente via hash_dedup. Não toca alertas manuais nem fechados.';

-- ---------------------------------------------------------------------
-- 6. View agregada para o painel preventivo (Módulo 3)
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW vw_painel_preventivo AS
SELECT
  cod_ibge,
  COUNT(*) FILTER (WHERE nivel = 'critico' AND status = 'aberto') AS criticos,
  COUNT(*) FILTER (WHERE nivel = 'atencao' AND status = 'aberto') AS atencao,
  COUNT(*) FILTER (WHERE nivel = 'informativo' AND status = 'aberto') AS informativos,
  COUNT(*) FILTER (WHERE status = 'aberto') AS total_abertos,
  COUNT(DISTINCT categoria) FILTER (WHERE status = 'aberto') AS categorias_afetadas,
  MAX(criado_em) FILTER (WHERE status = 'aberto') AS ultimo_alerta_em
FROM alertas
GROUP BY cod_ibge;
