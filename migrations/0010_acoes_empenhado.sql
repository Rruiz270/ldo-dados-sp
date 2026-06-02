-- 0010_acoes_empenhado.sql
-- ============================================================
-- Aditivo: valor empenhado de referência por ação orçamentária,
-- alimentado pela ingestão do dataset "Despesas" do TCE-SP
-- (pipeline/tce_despesas_programas.py).
--
-- Idempotente e seguro: apenas adiciona uma coluna nullable.
-- Não altera o gate nacional (uf_status / vw_municipios_publicados)
-- nem qualquer tabela existente além desta coluna.
-- ============================================================

ALTER TABLE acoes ADD COLUMN IF NOT EXISTS empenhado NUMERIC;

COMMENT ON COLUMN acoes.empenhado IS
  'Soma do valor empenhado (vl_despesa, fase Empenhado) por ação no exercício, '
  'a partir do dataset Despesas do TCE-SP. Valor de referência, atualizado '
  'mensalmente por pipeline/tce_despesas_programas.py.';
