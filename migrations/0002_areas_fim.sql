-- Áreas-fim e demais funções de governo do RREO Anexo 02.
-- Cada município, por ano + bimestre, tem dotação (meta da LOA),
-- empenhado e liquidado (execução) por função/subfunção.

DROP TABLE IF EXISTS despesa_por_funcao;

CREATE TABLE despesa_por_funcao (
  cod_ibge BIGINT NOT NULL,
  exercicio INTEGER NOT NULL,
  periodo INTEGER NOT NULL,           -- bimestre RREO 1-6
  funcao TEXT NOT NULL,               -- "Educação", "Saúde", "Assistência Social"...
  eh_subfuncao BOOLEAN DEFAULT FALSE, -- true se é subfunção (Atenção Básica, etc.)
  eh_area_fim BOOLEAN DEFAULT FALSE,  -- presta serviço direto à população
  funcao_pai TEXT,                    -- pra subfunções: qual função pai
  dotacao_inicial NUMERIC,            -- meta original (LOA aprovada)
  dotacao_atualizada NUMERIC,         -- após alterações orçamentárias
  empenhado NUMERIC,                  -- DESPESAS EMPENHADAS ATÉ O BIMESTRE
  liquidado NUMERIC,                  -- DESPESAS LIQUIDADAS ATÉ O BIMESTRE
  pct_do_total NUMERIC,               -- % do orçamento total (b/III b)
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (cod_ibge, exercicio, periodo, funcao)
);

CREATE INDEX IF NOT EXISTS idx_desp_func_munic_ano
  ON despesa_por_funcao(cod_ibge, exercicio, periodo);
CREATE INDEX IF NOT EXISTS idx_desp_func_area_fim
  ON despesa_por_funcao(eh_area_fim) WHERE eh_area_fim;
