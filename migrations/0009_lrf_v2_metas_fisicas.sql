-- ---------------------------------------------------------------------
-- 0009 — LRF v2: catálogo de metas/limites + faixas (prudencial/alerta)
--        e ganchos aditivos pro acompanhamento de metas físicas (fase futura)
-- ---------------------------------------------------------------------
-- Objetivo (Workstream A): reformular os indicadores fiscais/constitucionais
-- pra refletir corretamente a LRF (LC 101/2000) e a CF:
--
--   • Tetos (natureza='teto') sobre a RCL — alto = ruim:
--       pessoal 60% · divida/DCL 120% · operacoes_credito 16% ·
--       comprometimento_credito 11,5% · aro 7% · garantias 22%
--       (+ resultado_execucao, informativo, sem teto)
--   • Pisos constitucionais (natureza='piso') — alto = bom:
--       educacao/MDE ≥25% · saude/ASPS ≥15% · fundeb =100% ·
--       fundeb_profissionais ≥70%
--
--   • Faixas (só onde a lei define):
--       - prudencial (LRF Art. 22 §único): SÓ pessoal (57% = 95% do teto)
--       - alerta (LRF Art. 59 §1 I): pessoal (54%) e divida (108%)
--       - demais tetos NÃO têm prudencial/alerta → NULL → UI mostra "—"
--
-- ADITIVO e idempotente: CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
-- INSERT ... ON CONFLICT / CREATE OR REPLACE VIEW. Nenhum DROP. Vide
-- [[feedback_no_drop_table_in_migrations]]. SP-only: a view canônica faz JOIN
-- com vw_municipios_publicados (gate 0008) — não toca uf_status nem RS staging.
-- ---------------------------------------------------------------------

-- 1. Catálogo de metas/limites por indicador --------------------------
CREATE TABLE IF NOT EXISTS lrf_indicador_meta (
  indicador          TEXT PRIMARY KEY,
  rotulo             TEXT NOT NULL,
  tipo               TEXT NOT NULL CHECK (tipo IN ('fiscal_lrf', 'constitucional')),
  natureza           TEXT NOT NULL CHECK (natureza IN ('teto', 'piso')),
  limite_efetivo     NUMERIC,        -- 100% do limite legal (teto) ou piso obrigatório
  limite_prudencial  NUMERIC,        -- 95% do teto — SÓ pessoal; NULL p/ demais
  limite_alerta      NUMERIC,        -- 90% do teto — pessoal e divida; NULL p/ demais
  base_legal         TEXT,
  ordem              INTEGER NOT NULL DEFAULT 0
);

-- Semente dos 13 indicadores. Valores em pontos percentuais sobre a RCL (tetos)
-- ou pisos constitucionais. prudencial/alerta SÓ onde a lei prevê (NULL senão).
INSERT INTO lrf_indicador_meta
  (indicador, rotulo, tipo, natureza, limite_efetivo, limite_prudencial, limite_alerta, base_legal, ordem)
VALUES
  -- Tetos fiscais (LRF) ----------------------------------------------
  ('pessoal',                'Despesa total com pessoal',          'fiscal_lrf',      'teto',  60.0, 57.0, 54.0,  'LRF Art. 19/20 · 60% RCL · prudencial 57% (Art. 22) · alerta 54% (Art. 59)', 1),
  ('divida',                 'Dívida Consolidada Líquida (DCL)',   'fiscal_lrf',      'teto', 120.0, NULL, 108.0, 'LRF Art. 30 · Res. SF 40/2001 · 120% RCL · alerta 108% (Art. 59)',           2),
  ('operacoes_credito',      'Operações de crédito',               'fiscal_lrf',      'teto',  16.0, NULL, NULL,  'LRF Art. 32 · Res. SF 43/2001 · 16% RCL',                                    3),
  ('comprometimento_credito','Comprometimento c/ op. de crédito',  'fiscal_lrf',      'teto',  11.5, NULL, NULL,  'Res. SF 43/2001 Art. 7º · 11,5% RCL',                                        4),
  ('aro',                    'Antecipação de Receita Orçamentária','fiscal_lrf',      'teto',   7.0, NULL, NULL,  'LRF Art. 38 · Res. SF 43/2001 · 7% RCL',                                     5),
  ('garantias',              'Garantias e contragarantias',        'fiscal_lrf',      'teto',  22.0, NULL, NULL,  'LRF Art. 9º · Res. SF 43/2001 · 22% RCL',                                    6),
  ('resultado_execucao',     'Resultado da execução orçamentária', 'fiscal_lrf',      'teto',  NULL, NULL, NULL,  'LRF Art. 1º §1º · informativo (sem teto legal sobre RCL)',                    7),
  -- Pisos constitucionais --------------------------------------------
  ('educacao',               'Aplicação em educação (MDE)',        'constitucional',  'piso',  25.0, NULL, NULL,  'CF Art. 212 · mínimo 25% da receita de impostos',                            8),
  ('saude',                  'Aplicação em saúde (ASPS)',          'constitucional',  'piso',  15.0, NULL, NULL,  'CF Art. 198 §2º III · LC 141/2012 · mínimo 15%',                              9),
  ('fundeb',                 'FUNDEB — aplicação total',           'constitucional',  'piso', 100.0, NULL, NULL,  'CF ADCT Art. 60 · Lei 14.113/2020 · aplicar 100% no exercício',             10),
  ('fundeb_profissionais',   'FUNDEB — profissionais da educação', 'constitucional',  'piso',  70.0, NULL, NULL,  'Lei 14.113/2020 Art. 26 · mínimo 70% em remuneração',                       11)
ON CONFLICT (indicador) DO NOTHING;

-- 2. Colunas de faixa em indicadores_lrf (aditivo) --------------------
-- Carregadas pelo sync SP (pipeline/sync_to_neon.py) só onde a meta define.
ALTER TABLE indicadores_lrf ADD COLUMN IF NOT EXISTS limite_prudencial NUMERIC;
ALTER TABLE indicadores_lrf ADD COLUMN IF NOT EXISTS limite_alerta     NUMERIC;

-- 3. View canônica de leitura LRF v2 (SP-only via gate 0008) -----------
-- Junta o dado bruto (indicadores_lrf) com o catálogo (lrf_indicador_meta) e
-- aplica o gate nacional (vw_municipios_publicados → só UFs ready = SP hoje).
-- Expõe rotulo/tipo/natureza/limites e as faixas (prefere o valor gravado no
-- dado; cai no catálogo quando ausente). NÃO inclui resultado_execucao? Inclui:
-- o LEFT/INNER é por indicador, e o catálogo tem os 13.
CREATE OR REPLACE VIEW vw_lrf_indicadores AS
SELECT
  i.cod_ibge,
  i.exercicio,
  i.periodo,
  i.periodicidade,
  i.indicador,
  m.rotulo,
  m.tipo,
  m.natureza,
  i.valor,
  i.base_calculo,
  i.limite_legal,
  i.pct_do_limite,
  -- Faixas: usa o que o sync gravou; senão deriva do catálogo.
  COALESCE(i.limite_legal, m.limite_efetivo)          AS limite_efetivo,
  COALESCE(i.limite_prudencial, m.limite_prudencial)  AS limite_prudencial,
  COALESCE(i.limite_alerta, m.limite_alerta)          AS limite_alerta,
  m.base_legal,
  m.ordem,
  i.fonte,
  i.atualizado_em
FROM indicadores_lrf i
JOIN lrf_indicador_meta m       USING (indicador)
JOIN vw_municipios_publicados p ON p.cod_ibge = i.cod_ibge;

-- 4. Ganchos ADITIVOS para a fase futura de acompanhamento de metas ---
-- físicas (criados agora, NÃO consumidos por esta entrega). Aditivo/seguro.
ALTER TABLE metas_fisicas ADD COLUMN IF NOT EXISTS status_acompanhamento TEXT
  DEFAULT 'pendente';
-- CHECK adicionado em passo separado e idempotente (ADD CONSTRAINT não tem
-- IF NOT EXISTS — guardamos no catálogo de constraints).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'metas_fisicas_status_acomp_chk'
  ) THEN
    ALTER TABLE metas_fisicas
      ADD CONSTRAINT metas_fisicas_status_acomp_chk
      CHECK (status_acompanhamento IN ('pendente', 'preenchido', 'notificado', 'escalonado'));
  END IF;
END $$;

ALTER TABLE metas_fisicas ADD COLUMN IF NOT EXISTS bimestre_referencia INTEGER;
ALTER TABLE metas_fisicas ADD COLUMN IF NOT EXISTS responsavel_area    TEXT;

ALTER TABLE programas ADD COLUMN IF NOT EXISTS orgao_id BIGINT;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'programas_orgao_id_fkey'
  ) THEN
    ALTER TABLE programas
      ADD CONSTRAINT programas_orgao_id_fkey
      FOREIGN KEY (orgao_id) REFERENCES orgaos(id);
  END IF;
END $$;
