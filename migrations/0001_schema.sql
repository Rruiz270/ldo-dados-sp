-- Schema inicial LDO Dados SP
-- Rodar via: npm run db:migrate

CREATE TABLE IF NOT EXISTS municipios (
  cod_ibge BIGINT PRIMARY KEY,
  nome TEXT NOT NULL,
  populacao INTEGER,
  faixa_pop TEXT,    -- ate_5k | 5k_20k | 20k_50k | 50k_100k | 100k_500k | acima_500k
  regiao TEXT,       -- region administrative grouping (opcional)
  uf CHAR(2) DEFAULT 'SP',
  esfera CHAR(1) DEFAULT 'M',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Status de publicação por (município, extração)
-- Equivalente ao siconfi_data/*.status.json mas queryable
CREATE TABLE IF NOT EXISTS publicacao_status (
  cod_ibge BIGINT NOT NULL,
  dataset TEXT NOT NULL,    -- ex: 'rreo_2024_bim1', 'dca_2025', 'rgf_2024_q1'
  status TEXT NOT NULL,     -- 'PUBLICADO' | 'NAO_PUBLICADO' | 'ERRO_COLETA'
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (cod_ibge, dataset)
);

CREATE INDEX IF NOT EXISTS idx_pubstatus_status ON publicacao_status(status);
CREATE INDEX IF NOT EXISTS idx_pubstatus_dataset ON publicacao_status(dataset);

-- Indicadores LRF processados (denormalizados pra leitura rápida)
CREATE TABLE IF NOT EXISTS indicadores_lrf (
  cod_ibge BIGINT NOT NULL,
  exercicio INTEGER NOT NULL,
  periodo INTEGER NOT NULL,         -- bimestre (RREO) ou quadrimestre (RGF)
  periodicidade CHAR(1) NOT NULL,   -- 'B' | 'Q' | 'A'
  indicador TEXT NOT NULL,          -- 'pessoal' | 'divida' | 'educacao' | 'saude' | 'rcl'
  valor NUMERIC,
  base_calculo NUMERIC,             -- ex: RCL para cálculo de %
  limite_legal NUMERIC,             -- 60 (pessoal), 25 (educ), 15 (saude), 120 (divida x RCL)
  pct_do_limite NUMERIC,            -- valor/limite * 100 (ou direto se já é %)
  fonte TEXT NOT NULL,              -- 'RREO' | 'RGF' | 'DCA' | 'Audesp'
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (cod_ibge, exercicio, periodo, periodicidade, indicador)
);

CREATE INDEX IF NOT EXISTS idx_lrf_munic ON indicadores_lrf(cod_ibge);
CREATE INDEX IF NOT EXISTS idx_lrf_indicador ON indicadores_lrf(indicador, exercicio DESC, periodo DESC);

-- Despesas por função (drill-down do RREO Anexo 02)
CREATE TABLE IF NOT EXISTS despesa_por_funcao (
  cod_ibge BIGINT NOT NULL,
  exercicio INTEGER NOT NULL,
  periodo INTEGER NOT NULL,
  cod_funcao TEXT NOT NULL,
  funcao TEXT NOT NULL,
  valor_empenhado NUMERIC,
  valor_liquidado NUMERIC,
  valor_pago NUMERIC,
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (cod_ibge, exercicio, periodo, cod_funcao)
);

CREATE INDEX IF NOT EXISTS idx_desp_func_munic ON despesa_por_funcao(cod_ibge, exercicio);

-- Snapshot raw pra auditoria/debug (opcional, pode ficar pesado)
CREATE TABLE IF NOT EXISTS raw_extracoes (
  id BIGSERIAL PRIMARY KEY,
  cod_ibge BIGINT NOT NULL,
  dataset TEXT NOT NULL,
  payload JSONB NOT NULL,
  importado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raw_munic_dataset ON raw_extracoes(cod_ibge, dataset);

-- View de cobertura por município (substitui coverage.json)
CREATE OR REPLACE VIEW vw_cobertura_municipio AS
SELECT
  m.cod_ibge,
  m.nome,
  m.populacao,
  COUNT(*) FILTER (WHERE p.status = 'PUBLICADO') AS publicados,
  COUNT(*) FILTER (WHERE p.status = 'NAO_PUBLICADO') AS nao_publicados,
  COUNT(*) FILTER (WHERE p.status = 'ERRO_COLETA') AS erros,
  COUNT(*) AS total_extracoes
FROM municipios m
LEFT JOIN publicacao_status p USING (cod_ibge)
GROUP BY m.cod_ibge, m.nome, m.populacao;
