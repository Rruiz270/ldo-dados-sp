-- =====================================================================
-- Migration 0007 — Tabelas para importação manual
-- =====================================================================
-- Permite ao município cadastrar dados que não vêm de API:
-- precatórios (já existia), contratos continuados, convênios, riscos manuais

-- Contratos continuados (LRF Art. 16 — despesas obrigatórias de caráter continuado)
CREATE TABLE IF NOT EXISTS contratos_continuados (
  id              BIGSERIAL PRIMARY KEY,
  cod_ibge        BIGINT NOT NULL REFERENCES municipios(cod_ibge),
  numero_contrato TEXT,
  objeto          TEXT NOT NULL,
  contratado      TEXT,
  cnpj_contratado TEXT,
  valor_anual     NUMERIC,
  data_inicio     DATE,
  data_fim        DATE,
  modalidade      TEXT,                      -- 'pregao' | 'concorrencia' | 'dispensa' | 'inexigibilidade'
  reajuste_anual_pct NUMERIC,
  area            TEXT,                      -- 'educacao' | 'saude' | 'limpeza' | etc.
  risco_paralisacao TEXT,                    -- 'baixo' | 'medio' | 'alto'
  observacoes     TEXT,
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  criado_por      TEXT
);

CREATE INDEX IF NOT EXISTS idx_contratos_munic ON contratos_continuados(cod_ibge);
CREATE INDEX IF NOT EXISTS idx_contratos_area ON contratos_continuados(cod_ibge, area);

-- Convênios (transferências voluntárias)
CREATE TABLE IF NOT EXISTS convenios (
  id              BIGSERIAL PRIMARY KEY,
  cod_ibge        BIGINT NOT NULL REFERENCES municipios(cod_ibge),
  numero_convenio TEXT,
  objeto          TEXT NOT NULL,
  concedente      TEXT,                      -- ente que repassa
  esfera_concedente TEXT,                    -- 'federal' | 'estadual' | 'outros'
  valor_total     NUMERIC,
  valor_contrapartida NUMERIC,
  data_inicio     DATE,
  data_fim        DATE,
  status          TEXT DEFAULT 'em_execucao', -- 'em_execucao' | 'concluido' | 'rescindido' | 'inadimplente'
  area            TEXT,
  observacoes     TEXT,
  criado_em       TIMESTAMPTZ DEFAULT NOW(),
  criado_por      TEXT
);

CREATE INDEX IF NOT EXISTS idx_convenios_munic ON convenios(cod_ibge);
CREATE INDEX IF NOT EXISTS idx_convenios_status ON convenios(cod_ibge, status);
