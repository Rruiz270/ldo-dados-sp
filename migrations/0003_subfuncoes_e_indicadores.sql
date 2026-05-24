-- Migration 0003: subfunções + RCL + Resultado Primário

-- 1) PK ampliada: incluir funcao_pai pra permitir subfunções com mesmo nome
--    sob funções diferentes (ex: "Demais Subfunções")
ALTER TABLE despesa_por_funcao ALTER COLUMN funcao_pai SET DEFAULT '';
UPDATE despesa_por_funcao SET funcao_pai = '' WHERE funcao_pai IS NULL;
ALTER TABLE despesa_por_funcao ALTER COLUMN funcao_pai SET NOT NULL;

ALTER TABLE despesa_por_funcao DROP CONSTRAINT IF EXISTS despesa_por_funcao_pkey;
ALTER TABLE despesa_por_funcao
  ADD CONSTRAINT despesa_por_funcao_pkey
  PRIMARY KEY (cod_ibge, exercicio, periodo, funcao, funcao_pai);

CREATE INDEX IF NOT EXISTS idx_desp_subfuncao
  ON despesa_por_funcao(funcao_pai) WHERE eh_subfuncao;

-- 2) Tabela indicadores fiscais (RCL, Resultado Primário em R$)
CREATE TABLE IF NOT EXISTS indicadores_fiscais (
  cod_ibge BIGINT NOT NULL,
  exercicio INTEGER NOT NULL,
  periodo INTEGER NOT NULL,
  periodicidade CHAR(1) NOT NULL,
  indicador TEXT NOT NULL,
  valor NUMERIC NOT NULL,
  meta NUMERIC,
  fonte TEXT NOT NULL,
  atualizado_em TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (cod_ibge, exercicio, periodo, periodicidade, indicador)
);

CREATE INDEX IF NOT EXISTS idx_fiscais_munic_ano
  ON indicadores_fiscais(cod_ibge, exercicio DESC);
