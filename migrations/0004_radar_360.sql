-- =====================================================================
-- Migration 0004 — Radar Fiscal Municipal 360
-- =====================================================================
-- Adiciona suporte aos módulos 1-13 do documento "Radar Fiscal Municipal 360":
--   - Proveniência de dados (fontes oficiais + extrações)
--   - Cadastro institucional (órgãos, unidades, programas, ações, metas)
--   - SIOPE (educação/Fundeb) e SIOPS (saúde)
--   - INEP/IDEB e indicadores externos genéricos (IEGM, IGM, ambientais, socio)
--   - PPA/LDO/LOA — textos legais + metas estruturadas
--   - Riscos fiscais + alertas + providências
--   - Matriz legal (rastreabilidade normativa)
--
-- Tudo IF NOT EXISTS — idempotente.
-- Compatível com schema atual (não mexe em tabelas existentes).
-- Preparado para expansão BR: todas as referências por cod_ibge (nacionalmente único).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Proveniência de dados (RF-17, RF-18)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fontes (
  id           TEXT PRIMARY KEY,          -- 'SICONFI', 'AUDESP', 'SIOPE', 'SIOPS', 'INEP', 'TCE-SP-IEGM', 'IBGE', 'SEFAZ-SP', etc.
  operador     TEXT NOT NULL,             -- 'STN', 'TCE-SP', 'FNDE', 'DataSUS', 'INEP/MEC', etc.
  url_base     TEXT,
  tipo_acesso  TEXT,                      -- 'REST_API', 'BULK_DOWNLOAD', 'SCRAPER_HTML', 'PDF_LLM'
  cobertura    TEXT,                      -- descrição livre
  observacoes  TEXT,
  ativo        BOOLEAN DEFAULT TRUE,
  criado_em    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS extracoes (
  id           BIGSERIAL PRIMARY KEY,
  fonte_id     TEXT NOT NULL REFERENCES fontes(id),
  dataset      TEXT NOT NULL,             -- 'rreo_2023_bim1', 'siope_2024', 'inep_ideb_2023'
  cod_ibge     BIGINT,                    -- NULL quando é bulk nacional
  exercicio    INTEGER,
  periodo      INTEGER,                   -- bimestre/quadrimestre/null
  coletado_em  TIMESTAMPTZ DEFAULT NOW(),
  validado_em  TIMESTAMPTZ,
  validado_por TEXT,
  status       TEXT NOT NULL,             -- 'OK', 'PARCIAL', 'NAO_PUBLICADO', 'ERRO'
  tamanho_bytes BIGINT,
  hash_payload TEXT,                      -- md5 do payload, p/ dedup
  metadata     JSONB                      -- livre
);

CREATE INDEX IF NOT EXISTS idx_extracoes_fonte_dataset ON extracoes(fonte_id, dataset);
CREATE INDEX IF NOT EXISTS idx_extracoes_munic ON extracoes(cod_ibge, exercicio, periodo);

-- ---------------------------------------------------------------------
-- 2. Cadastro institucional (Módulo 1)
-- ---------------------------------------------------------------------

-- Enriquecimento de municipios (campos opcionais; idempotente)
ALTER TABLE municipios ADD COLUMN IF NOT EXISTS pib_estimado NUMERIC;
ALTER TABLE municipios ADD COLUMN IF NOT EXISTS idhm NUMERIC(4,3);
ALTER TABLE municipios ADD COLUMN IF NOT EXISTS prefeito TEXT;
ALTER TABLE municipios ADD COLUMN IF NOT EXISTS partido_prefeito TEXT;
ALTER TABLE municipios ADD COLUMN IF NOT EXISTS portal_transparencia_url TEXT;
ALTER TABLE municipios ADD COLUMN IF NOT EXISTS site_oficial_url TEXT;

CREATE TABLE IF NOT EXISTS orgaos (
  id           BIGSERIAL PRIMARY KEY,
  cod_ibge     BIGINT NOT NULL REFERENCES municipios(cod_ibge),
  nome         TEXT NOT NULL,
  tipo         TEXT NOT NULL,             -- 'executivo' | 'legislativo' | 'autarquia' | 'fundacao' | 'fundo' | 'consorcio'
  responsavel  TEXT,
  cargo_responsavel TEXT,
  contato      TEXT,
  observacoes  TEXT,
  ativo        BOOLEAN DEFAULT TRUE,
  UNIQUE (cod_ibge, nome, tipo)
);

CREATE TABLE IF NOT EXISTS unidades_orcamentarias (
  id           BIGSERIAL PRIMARY KEY,
  cod_ibge     BIGINT NOT NULL,
  exercicio    INTEGER NOT NULL,
  codigo       TEXT NOT NULL,
  nome         TEXT NOT NULL,
  orgao_id     BIGINT REFERENCES orgaos(id),
  UNIQUE (cod_ibge, exercicio, codigo)
);

CREATE TABLE IF NOT EXISTS fontes_recursos (
  id           BIGSERIAL PRIMARY KEY,
  cod_ibge     BIGINT NOT NULL,
  exercicio    INTEGER NOT NULL,
  codigo       TEXT NOT NULL,             -- ex. '00' (Recursos Próprios), '02' (Transferências)
  nome         TEXT NOT NULL,
  vinculacao   TEXT,                      -- 'livre' | 'educacao' | 'saude' | 'fundeb' | etc.
  UNIQUE (cod_ibge, exercicio, codigo)
);

-- ---------------------------------------------------------------------
-- 3. PPA / LDO / LOA — textos legais + metas estruturadas (Módulo 4)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS documentos_legais (
  id           BIGSERIAL PRIMARY KEY,
  cod_ibge     BIGINT NOT NULL,
  tipo         TEXT NOT NULL,             -- 'PPA' | 'LDO' | 'LOA' | 'Lei_Orgânica' | 'Plano_Educação' | 'Plano_Saude'
  exercicio    INTEGER,                   -- ano de vigência (LOA/LDO); PPA tem inicio_exercicio + fim_exercicio
  inicio_exercicio INTEGER,
  fim_exercicio    INTEGER,
  numero_lei   TEXT,
  data_lei     DATE,
  url_pdf      TEXT,
  texto_completo TEXT,                    -- extraído do PDF
  resumo       TEXT,                      -- gerado por LLM
  fonte_id     TEXT REFERENCES fontes(id),
  extracao_id  BIGINT REFERENCES extracoes(id),
  validado     BOOLEAN DEFAULT FALSE,
  criado_em    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cod_ibge, tipo, exercicio, numero_lei)
);

CREATE INDEX IF NOT EXISTS idx_doclegal_munic ON documentos_legais(cod_ibge, tipo, exercicio);

CREATE TABLE IF NOT EXISTS ldo_metas_fiscais (
  id           BIGSERIAL PRIMARY KEY,
  cod_ibge     BIGINT NOT NULL,
  exercicio    INTEGER NOT NULL,
  indicador    TEXT NOT NULL,             -- 'resultado_primario' | 'resultado_nominal' | 'divida_consolidada' | 'receita_total' | 'despesa_total'
  meta_valor   NUMERIC,
  meta_pct     NUMERIC,
  base_legal   TEXT,
  documento_id BIGINT REFERENCES documentos_legais(id),
  UNIQUE (cod_ibge, exercicio, indicador)
);

CREATE TABLE IF NOT EXISTS programas (
  id           BIGSERIAL PRIMARY KEY,
  cod_ibge     BIGINT NOT NULL,
  exercicio    INTEGER NOT NULL,          -- PPA reference year
  codigo       TEXT NOT NULL,
  nome         TEXT NOT NULL,
  objetivo     TEXT,
  area         TEXT,                      -- 'Educação', 'Saúde', etc.
  publico_alvo TEXT,
  documento_id BIGINT REFERENCES documentos_legais(id),
  UNIQUE (cod_ibge, exercicio, codigo)
);

CREATE TABLE IF NOT EXISTS acoes (
  id           BIGSERIAL PRIMARY KEY,
  programa_id  BIGINT NOT NULL REFERENCES programas(id),
  codigo       TEXT NOT NULL,
  nome         TEXT NOT NULL,
  produto      TEXT,
  unidade_medida TEXT,
  UNIQUE (programa_id, codigo)
);

CREATE TABLE IF NOT EXISTS metas_fisicas (
  id           BIGSERIAL PRIMARY KEY,
  acao_id      BIGINT NOT NULL REFERENCES acoes(id),
  exercicio    INTEGER NOT NULL,
  meta_quantidade NUMERIC,
  realizado_quantidade NUMERIC,
  pct_execucao NUMERIC GENERATED ALWAYS AS (
    CASE WHEN meta_quantidade > 0
         THEN (realizado_quantidade / meta_quantidade) * 100
         ELSE NULL END
  ) STORED,
  observacoes  TEXT,
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (acao_id, exercicio)
);

-- ---------------------------------------------------------------------
-- 4. SIOPE — Educação / Fundeb (Módulo 6)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS indicadores_educacao (
  cod_ibge     BIGINT NOT NULL,
  exercicio    INTEGER NOT NULL,
  periodo      INTEGER NOT NULL,          -- bimestre (RREO Anexo 08) ou 0 para consolidado anual SIOPE
  indicador    TEXT NOT NULL,             -- 'mde_pct' | 'fundeb_aplicacao_pct' | 'fundeb_remuneracao_pct' | 'gasto_aluno' | etc.
  valor        NUMERIC,
  base_calculo NUMERIC,
  limite_legal NUMERIC,                   -- 25 (MDE), 70 (Fundeb remuneração)
  fonte_id     TEXT REFERENCES fontes(id),
  fonte_detalhe TEXT,                     -- 'RREO-Anexo 08' | 'SIOPE consolidado' | etc.
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (cod_ibge, exercicio, periodo, indicador, fonte_detalhe)
);

CREATE INDEX IF NOT EXISTS idx_educ_munic ON indicadores_educacao(cod_ibge, exercicio DESC);

-- ---------------------------------------------------------------------
-- 5. SIOPS — Saúde (Módulo 6)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS indicadores_saude (
  cod_ibge     BIGINT NOT NULL,
  exercicio    INTEGER NOT NULL,
  periodo      INTEGER NOT NULL,
  indicador    TEXT NOT NULL,             -- 'asps_pct' | 'cobertura_aps' | 'mortalidade_infantil' | etc.
  valor        NUMERIC,
  base_calculo NUMERIC,
  limite_legal NUMERIC,                   -- 15 (ASPS)
  fonte_id     TEXT REFERENCES fontes(id),
  fonte_detalhe TEXT,
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (cod_ibge, exercicio, periodo, indicador, fonte_detalhe)
);

CREATE INDEX IF NOT EXISTS idx_saude_munic ON indicadores_saude(cod_ibge, exercicio DESC);

-- ---------------------------------------------------------------------
-- 6. INEP / IDEB e indicadores educacionais (Módulo 6 + Módulo externos)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ideb (
  cod_ibge     BIGINT NOT NULL,
  rede         TEXT NOT NULL,             -- 'municipal' | 'estadual' | 'privada' | 'publica'
  etapa        TEXT NOT NULL,             -- 'anos_iniciais' | 'anos_finais' | 'ensino_medio'
  ciclo_avaliacao INTEGER NOT NULL,       -- 2017, 2019, 2021, 2023, 2025
  ideb_observado NUMERIC,
  ideb_projetado NUMERIC,
  meta_atingida BOOLEAN GENERATED ALWAYS AS (
    CASE WHEN ideb_observado IS NULL OR ideb_projetado IS NULL THEN NULL
         ELSE ideb_observado >= ideb_projetado END
  ) STORED,
  nota_padronizada_lp NUMERIC,            -- prova brasil/saeb
  nota_padronizada_mat NUMERIC,
  fluxo        NUMERIC,
  fonte_id     TEXT DEFAULT 'INEP' REFERENCES fontes(id),
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (cod_ibge, rede, etapa, ciclo_avaliacao)
);

-- ---------------------------------------------------------------------
-- 7. Indicador externo genérico (IEGM, IGM, ambientais, socioeconômicos)
-- ---------------------------------------------------------------------
-- Schema-flexível: cada fonte externa cadastra seu indicador e dado vai aqui.
-- Permite acomodar IEGM (TCE), IGM (CFA), CETESB, SNIS, IPEA-DATA, etc.

CREATE TABLE IF NOT EXISTS indicadores_externos (
  id           BIGSERIAL PRIMARY KEY,
  cod_ibge     BIGINT NOT NULL,
  fonte_id     TEXT NOT NULL REFERENCES fontes(id),
  indicador    TEXT NOT NULL,             -- 'iegm_total' | 'igm' | 'cobertura_esgoto' | 'taxa_desemprego'
  categoria    TEXT,                      -- 'gestao' | 'educacao' | 'saude' | 'ambiental' | 'socio' | 'economico'
  periodo_referencia DATE NOT NULL,       -- ex: 2024-12-31 para indicador anual de 2024
  valor_numerico NUMERIC,
  valor_texto  TEXT,                      -- ex: 'A+', 'B', categorias qualitativas
  unidade      TEXT,                      -- 'pct', 'R$', 'pessoas', 'nota_0_10'
  metadata     JSONB,                     -- detalhes da fonte (metodologia, etc.)
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cod_ibge, fonte_id, indicador, periodo_referencia)
);

CREATE INDEX IF NOT EXISTS idx_ext_munic ON indicadores_externos(cod_ibge, fonte_id);
CREATE INDEX IF NOT EXISTS idx_ext_indicador ON indicadores_externos(indicador, periodo_referencia DESC);

-- ---------------------------------------------------------------------
-- 8. Dívida, crédito, garantias, caixa (Módulo 7)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS divida_e_caixa (
  cod_ibge     BIGINT NOT NULL,
  exercicio    INTEGER NOT NULL,
  periodo      INTEGER NOT NULL,          -- quadrimestre RGF
  indicador    TEXT NOT NULL,             -- 'dcl' | 'operacoes_credito' | 'garantias' | 'servico_divida' | 'restos_pagar_proc' | 'restos_pagar_nproc' | 'disp_caixa'
  valor        NUMERIC,
  base_calculo NUMERIC,                   -- RCL p/ percentuais
  limite_legal NUMERIC,                   -- 120% RCL (DCL), 16% (op crédito), 22% (garantias)
  pct_do_limite NUMERIC,
  fonte_id     TEXT REFERENCES fontes(id),
  fonte_detalhe TEXT,
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (cod_ibge, exercicio, periodo, indicador)
);

CREATE TABLE IF NOT EXISTS precatorios (
  id           BIGSERIAL PRIMARY KEY,
  cod_ibge     BIGINT NOT NULL,
  exercicio    INTEGER NOT NULL,
  valor_total  NUMERIC,
  qtd_processos INTEGER,
  classificacao TEXT,                     -- 'alimentar' | 'comum'
  observacoes  TEXT,
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cod_ibge, exercicio, classificacao)
);

-- ---------------------------------------------------------------------
-- 9. Riscos fiscais (Módulo 8)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS riscos (
  id           BIGSERIAL PRIMARY KEY,
  cod_ibge     BIGINT NOT NULL,
  tipo         TEXT NOT NULL,             -- 'receita' | 'despesa' | 'divida' | 'judicial' | 'previdenciario' | 'contratual' | 'orcamentario' | 'externo'
  titulo       TEXT NOT NULL,
  descricao    TEXT,
  nivel        TEXT NOT NULL,             -- 'baixo' | 'medio' | 'alto' | 'critico'
  identificado_em TIMESTAMPTZ DEFAULT NOW(),
  fonte_indicador TEXT,                   -- indicador que disparou o risco
  valor_referencia NUMERIC,
  status       TEXT DEFAULT 'aberto',     -- 'aberto' | 'mitigado' | 'materializado' | 'descartado'
  resolvido_em TIMESTAMPTZ,
  observacoes  TEXT
);

CREATE INDEX IF NOT EXISTS idx_riscos_munic ON riscos(cod_ibge, status);
CREATE INDEX IF NOT EXISTS idx_riscos_nivel ON riscos(nivel, status);

CREATE TABLE IF NOT EXISTS solucoes_possiveis (
  id           BIGSERIAL PRIMARY KEY,
  tipo_risco   TEXT NOT NULL,             -- igual ao 'tipo' de riscos
  titulo       TEXT NOT NULL,
  descricao    TEXT,
  fundamento_legal TEXT,
  prioridade   INTEGER DEFAULT 0
);

-- ---------------------------------------------------------------------
-- 10. Alertas e providências (Módulo 9)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS alertas (
  id           BIGSERIAL PRIMARY KEY,
  cod_ibge     BIGINT NOT NULL,
  indicador    TEXT NOT NULL,
  exercicio    INTEGER,
  periodo      INTEGER,
  nivel        TEXT NOT NULL,             -- 'atencao' | 'critico' | 'informativo'
  mensagem     TEXT NOT NULL,
  base_legal   TEXT,
  risco_id     BIGINT REFERENCES riscos(id),
  status       TEXT DEFAULT 'aberto',     -- 'aberto' | 'em_andamento' | 'concluido' | 'descartado'
  criado_em    TIMESTAMPTZ DEFAULT NOW(),
  fechado_em   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alertas_munic ON alertas(cod_ibge, status);
CREATE INDEX IF NOT EXISTS idx_alertas_nivel ON alertas(nivel, status);

CREATE TABLE IF NOT EXISTS providencias (
  id           BIGSERIAL PRIMARY KEY,
  alerta_id    BIGINT REFERENCES alertas(id),
  risco_id     BIGINT REFERENCES riscos(id),
  cod_ibge     BIGINT NOT NULL,
  descricao    TEXT NOT NULL,
  responsavel  TEXT,
  prazo        DATE,
  status       TEXT DEFAULT 'pendente',   -- 'pendente' | 'em_andamento' | 'concluida' | 'justificada' | 'cancelada'
  evidencia_url TEXT,
  criado_em    TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_providencias_munic ON providencias(cod_ibge, status);

-- ---------------------------------------------------------------------
-- 11. Matriz legal (Módulo 11)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS matriz_legal (
  id           BIGSERIAL PRIMARY KEY,
  norma        TEXT NOT NULL,             -- 'CF/88', 'LRF', 'Lei 4.320/64', 'Lei 14.113/2020 (Fundeb)', 'LC 141/2012'
  artigo       TEXT,                      -- 'Art. 169 §1º', 'Art. 19 III'
  ementa       TEXT,
  indicador    TEXT,                      -- indicador a que se aplica (ex: 'pessoal_executivo')
  parametro    TEXT,                      -- '60% RCL', 'limite prudencial 57%'
  link_oficial TEXT,
  ativo        BOOLEAN DEFAULT TRUE,
  UNIQUE (norma, artigo, indicador)
);

-- ---------------------------------------------------------------------
-- 12. Histórico e tendências — view materializada de médias ponderadas (RF-23, RF-24)
-- ---------------------------------------------------------------------

-- View para análise de aderência da execução atual aos 3 exercícios anteriores
-- (Receita, Despesa, Educação, Saúde). Material da subseção 18.3 do documento.

CREATE OR REPLACE VIEW vw_aderencia_historica AS
WITH lrf_pivoted AS (
  SELECT
    cod_ibge,
    exercicio,
    MAX(CASE WHEN indicador = 'educacao' THEN pct_do_limite END) AS pct_educacao,
    MAX(CASE WHEN indicador = 'saude'    THEN pct_do_limite END) AS pct_saude,
    MAX(CASE WHEN indicador = 'pessoal'  THEN pct_do_limite END) AS pct_pessoal
  FROM indicadores_lrf
  GROUP BY cod_ibge, exercicio
),
ultimo_ano AS (
  SELECT cod_ibge, MAX(exercicio) AS ano_atual FROM lrf_pivoted GROUP BY cod_ibge
),
janela_3a AS (
  SELECT
    u.cod_ibge,
    u.ano_atual,
    AVG(p.pct_educacao) AS media3a_educacao,
    AVG(p.pct_saude)    AS media3a_saude,
    AVG(p.pct_pessoal)  AS media3a_pessoal
  FROM ultimo_ano u
  JOIN lrf_pivoted p
    ON p.cod_ibge = u.cod_ibge
   AND p.exercicio BETWEEN u.ano_atual - 3 AND u.ano_atual - 1
  GROUP BY u.cod_ibge, u.ano_atual
)
SELECT
  u.cod_ibge,
  u.ano_atual,
  atual.pct_educacao  AS educacao_atual,
  j.media3a_educacao  AS educacao_media3a,
  atual.pct_saude     AS saude_atual,
  j.media3a_saude     AS saude_media3a,
  atual.pct_pessoal   AS pessoal_atual,
  j.media3a_pessoal   AS pessoal_media3a
FROM ultimo_ano u
LEFT JOIN lrf_pivoted atual
  ON atual.cod_ibge = u.cod_ibge AND atual.exercicio = u.ano_atual
LEFT JOIN janela_3a j
  ON j.cod_ibge = u.cod_ibge AND j.ano_atual = u.ano_atual;

-- ---------------------------------------------------------------------
-- 13. Seed inicial — fontes oficiais conhecidas + matriz legal mínima
-- ---------------------------------------------------------------------

INSERT INTO fontes (id, operador, url_base, tipo_acesso, cobertura, observacoes) VALUES
  ('SICONFI',   'STN',         'https://apidatalake.tesouro.gov.br/ords/siconfi/tt', 'REST_API',       'BR todo (5570 munic)', 'RREO bimestral, RGF quadrimestral, DCA anual'),
  ('AUDESP',    'TCE-SP',      'https://transparencia.tce.sp.gov.br/sites/default/files/conjunto-dados', 'BULK_DOWNLOAD', '644 munic SP (sem capital)', 'Análises, RCL completo, alertas, receitas, dívida ativa'),
  ('TCM-SP',    'TCM-SP',      'https://www.tcm.sp.gov.br',                            'SCRAPER_HTML',  'Apenas SP capital', 'Único munic não coberto por AUDESP'),
  ('SIOPE',     'FNDE',        'https://www.fnde.gov.br/siope/',                       'REST_API',      'BR todo', 'Indicadores educacionais, Fundeb, MDE'),
  ('SIOPS',     'DataSUS',     'http://siops.datasus.gov.br/',                         'REST_API',      'BR todo', 'Aplicação ASPS, receitas vinculadas saúde'),
  ('INEP',      'INEP/MEC',    'https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos', 'BULK_DOWNLOAD', 'BR todo', 'IDEB bienal, microdados escolares'),
  ('IBGE',      'IBGE',        'https://servicodados.ibge.gov.br/api/v3',              'REST_API',      'BR todo', 'População, PIB municipal, dados demográficos'),
  ('SEFAZ-SP',  'SEFAZ-SP',    'https://www.fazenda.sp.gov.br',                        'SCRAPER_HTML',  'SP', 'ICMS, IPVA, valor adicionado, repasses'),
  ('TCE-SP-IEGM','TCE-SP',     'https://iegm.tce.sp.gov.br',                            'SCRAPER_HTML',  'SP', 'Índice de Efetividade da Gestão Municipal'),
  ('PORTAL-LEIS','Câmaras/Prefeituras','varia',                                         'SCRAPER_HTML',  'BR todo (best-effort)', 'PPA/LDO/LOA — portais municipais variados'),
  ('LEIS-MUNICIPAIS','LeisMunicipais.com.br','https://leismunicipais.com.br',           'SCRAPER_HTML',  'BR todo', 'Repositório agregador de leis municipais')
ON CONFLICT (id) DO NOTHING;

-- Matriz legal mínima (RF-07)
INSERT INTO matriz_legal (norma, artigo, ementa, indicador, parametro, link_oficial) VALUES
  ('CF/88',                 'Art. 212',           'Aplicação mínima em manutenção e desenvolvimento do ensino',         'educacao',         '25% receita impostos', 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm'),
  ('CF/88',                 'Art. 198 §2º III',   'Aplicação mínima em ações e serviços públicos de saúde (Municípios)','saude',           '15% receita impostos', 'https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm'),
  ('LC 101/2000 (LRF)',     'Art. 19 III',        'Limite de despesa com pessoal — Município (Executivo + Legislativo)','pessoal_executivo','60% RCL',             'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp101.htm'),
  ('LC 101/2000 (LRF)',     'Art. 22 §único',     'Limite prudencial despesa com pessoal',                              'pessoal_executivo','57% RCL (95% do limite)', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp101.htm'),
  ('LC 101/2000 (LRF)',     'Art. 20',            'Repartição limite pessoal entre Poderes',                            'pessoal_legislativo','6% RCL (Câmara)',    'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp101.htm'),
  ('Res. SF 40/2001',       'Art. 3º',            'Limite Dívida Consolidada Líquida — Municípios',                     'dcl',              '120% RCL',            'https://www2.senado.leg.br/bdsf/handle/id/580'),
  ('Res. SF 43/2001',       'Art. 7º',            'Limite operações de crédito',                                       'operacoes_credito','16% RCL/ano',          'https://www2.senado.leg.br/bdsf/handle/id/580'),
  ('Res. SF 43/2001',       'Art. 9º',            'Limite garantias',                                                  'garantias',        '22% RCL',              'https://www2.senado.leg.br/bdsf/handle/id/580'),
  ('Lei 14.113/2020 (Fundeb)','Art. 26',          'Aplicação mínima em remuneração dos profissionais da educação',     'fundeb_remuneracao','70% Fundeb',          'https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14113.htm'),
  ('LC 141/2012',           'Art. 7º',            'Aplicação mínima saúde — Municípios',                                'asps',             '15% receita impostos', 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp141.htm')
ON CONFLICT (norma, artigo, indicador) DO NOTHING;

-- Soluções possíveis (item 14.4 do documento)
INSERT INTO solucoes_possiveis (tipo_risco, titulo, descricao, fundamento_legal, prioridade) VALUES
  ('receita',       'Limitação de empenho',           'Revisar programação financeira, reestimar arrecadação, limitar empenhos e priorizar despesas essenciais.', 'LRF Art. 9º', 10),
  ('despesa',       'Suspender atos de aumento',      'Revisar projeção da folha, suspender atos de aumento, controlar horas extras e reavaliar admissões.',       'LRF Art. 22', 10),
  ('orcamentario',  'Reprogramação de metas LDO',     'Reprogramar cronograma, identificar entraves, redefinir responsáveis e revisar dotação.',                    'LDO local', 5),
  ('externo',       'Plano de ação setorial',         'Cruzar dados externos com programas municipais, revisar prioridades da LDO e propor plano de correção.',     'PPA local', 3),
  ('divida',        'Renegociar cronograma',          'Reavaliar operações de crédito, controlar novos financiamentos e projetar impacto na RCL.',                   'LRF Art. 35', 8),
  ('judicial',      'Provisionar passivo',            'Acompanhar precatórios e RPV, projetar pagamento ordem cronológica e provisionar caixa.',                     'CF Art. 100', 7),
  ('previdenciario','Avaliar regularização RPPS',     'Atualizar projeção atuarial, avaliar parcelamento, monitorar suficiência financeira.',                       'Lei 9.717/98', 6),
  ('contratual',    'Revisar contratos críticos',     'Mapear contratos continuados, reajustes e equilíbrios; identificar contratos essenciais com risco.',         'Lei 14.133/21', 5)
ON CONFLICT DO NOTHING;
