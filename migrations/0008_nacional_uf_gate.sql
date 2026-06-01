-- ---------------------------------------------------------------------
-- 0008 — Fundação nacional: gate de prontidão por UF
-- ---------------------------------------------------------------------
-- Objetivo: permitir carregar os ~5.570 municípios do Brasil estado-a-estado
-- SEM expor estados meio-carregados nem perturbar São Paulo (645 munis, em
-- produção). A estratégia é um flag de prontidão por UF:
--
--   staging → estado sendo populado; INVISÍVEL pro Radar (alertas, rankings).
--   ready   → estado completo e publicado.
--
-- Carregar dados nunca publica um estado. Só o flip explícito staging→ready o
-- torna visível. Logo a extração nacional é segura a QUALQUER ponto de parada.
--
-- Idempotente (runner re-aplica tudo): CREATE ... IF NOT EXISTS / CREATE OR
-- REPLACE / INSERT ... ON CONFLICT DO NOTHING. Nenhum DROP. Vide
-- [[feedback_no_drop_table_in_migrations]].
-- ---------------------------------------------------------------------

-- 1. Catálogo de prontidão por UF -------------------------------------
CREATE TABLE IF NOT EXISTS uf_status (
  uf            CHAR(2) PRIMARY KEY,
  nome          TEXT NOT NULL,
  regiao        TEXT,                      -- N | NE | CO | SE | S
  status        TEXT NOT NULL DEFAULT 'staging'
                  CHECK (status IN ('staging', 'ready', 'pausado')),
  -- Tribunal de Contas que recebe PPA/LDO/LOA (Camada 1) deste estado.
  -- SP = TCE-SP (AUDESP) + TCM-SP (capital). Demais variam.
  tribunal      TEXT,
  cobertura_pct NUMERIC(5,2),              -- % de munis do estado com base fiscal mínima
  observacoes   TEXT,
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Semente das 27 UFs (Brasil) --------------------------------------
-- Todas entram como 'staging', EXCETO São Paulo, que já está em produção.
INSERT INTO uf_status (uf, nome, regiao, status, tribunal, observacoes) VALUES
  ('AC','Acre','N','staging','TCE-AC',NULL),
  ('AL','Alagoas','NE','staging','TCE-AL',NULL),
  ('AP','Amapá','N','staging','TCE-AP',NULL),
  ('AM','Amazonas','N','staging','TCE-AM',NULL),
  ('BA','Bahia','NE','staging','TCE-BA',NULL),
  ('CE','Ceará','NE','staging','TCE-CE',NULL),
  ('DF','Distrito Federal','CO','staging','TCDF','Sem municípios — ente único'),
  ('ES','Espírito Santo','SE','staging','TCE-ES',NULL),
  ('GO','Goiás','CO','staging','TCE-GO',NULL),
  ('MA','Maranhão','NE','staging','TCE-MA',NULL),
  ('MT','Mato Grosso','CO','staging','TCE-MT',NULL),
  ('MS','Mato Grosso do Sul','CO','staging','TCE-MS',NULL),
  ('MG','Minas Gerais','SE','staging','TCE-MG','853 munis — maior nº do país'),
  ('PA','Pará','N','staging','TCE-PA',NULL),
  ('PB','Paraíba','NE','staging','TCE-PB',NULL),
  ('PR','Paraná','S','staging','TCE-PR',NULL),
  ('PE','Pernambuco','NE','staging','TCE-PE',NULL),
  ('PI','Piauí','NE','staging','TCE-PI',NULL),
  ('RJ','Rio de Janeiro','SE','staging','TCE-RJ','Capital fiscalizada por TCM-RJ'),
  ('RN','Rio Grande do Norte','NE','staging','TCE-RN',NULL),
  ('RS','Rio Grande do Sul','S','staging','TCE-RS',NULL),
  ('RO','Rondônia','N','staging','TCE-RO',NULL),
  ('RR','Roraima','N','staging','TCE-RR',NULL),
  ('SC','Santa Catarina','S','staging','TCE-SC',NULL),
  ('SP','São Paulo','SE','ready','TCE-SP','EM PRODUÇÃO. AUDESP cobre 644; capital via TCM-SP'),
  ('SE','Sergipe','NE','staging','TCE-SE',NULL),
  ('TO','Tocantins','N','staging','TCE-TO',NULL)
ON CONFLICT (uf) DO NOTHING;   -- nunca rebaixa SP de ready em re-run

-- 3. Garante que municipios.uf reflete a realidade --------------------
-- A coluna já existe (0001, DEFAULT 'SP'). Backfill defensivo: linhas sem uf
-- são as 645 paulistas pré-nacional. (Em prod hoje não há NULL — DEFAULT 'SP'.)
UPDATE municipios SET uf = 'SP' WHERE uf IS NULL;

-- Index pro filtro por UF (rankings nacionais, regeração escopada, busca).
CREATE INDEX IF NOT EXISTS idx_municipios_uf ON municipios(uf);

-- 4. View canônica de "o que está publicado" --------------------------
-- Fonte única de verdade pro app e pra regeração de alertas: SÓ municípios de
-- UFs ready. Hoje devolve exatamente os 645 de SP — comportamento idêntico ao
-- atual. Quando MG virar ready, passa a incluí-lo, e só então.
CREATE OR REPLACE VIEW vw_municipios_publicados AS
SELECT m.*
FROM municipios m
JOIN uf_status u ON u.uf = m.uf
WHERE u.status = 'ready';

-- 5. Painel de progresso da expansão nacional -------------------------
-- Quantos munis cada UF tem em staging vs. quanto falta. Operacional, não
-- toca SP. Usa indicadores_lrf como proxy de "tem base fiscal".
CREATE OR REPLACE VIEW vw_progresso_nacional AS
SELECT
  u.uf,
  u.nome,
  u.regiao,
  u.status,
  COUNT(DISTINCT m.cod_ibge)                                        AS munis_carregados,
  COUNT(DISTINCT l.cod_ibge)                                        AS munis_com_fiscal,
  u.cobertura_pct,
  u.atualizado_em
FROM uf_status u
LEFT JOIN municipios m       ON m.uf = u.uf
LEFT JOIN indicadores_lrf l  ON l.cod_ibge = m.cod_ibge
GROUP BY u.uf, u.nome, u.regiao, u.status, u.cobertura_pct, u.atualizado_em
ORDER BY
  CASE u.status WHEN 'ready' THEN 0 WHEN 'staging' THEN 1 ELSE 2 END,
  munis_com_fiscal DESC;

-- ---------------------------------------------------------------------
-- Nota: a regeração diária de alertas (pipeline/regenerar_alertas.py) deve
-- iterar sobre vw_municipios_publicados — não sobre municipios — pra nunca
-- gerar alerta de estado em staging. Edição correspondente no .py.
-- ---------------------------------------------------------------------
