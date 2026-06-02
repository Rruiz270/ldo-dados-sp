-- ---------------------------------------------------------------------
-- 0011 — IBGE MUNIC: indicadores institucionais municipais (645 SP)
-- ---------------------------------------------------------------------
-- A Pesquisa de Informações Básicas Municipais (MUNIC/IBGE) descreve a
-- estrutura institucional de cada município: planos, conselhos, fundos,
-- carreira do magistério, etc. Ingerimos via API v3 (agregados/SIDRA) e
-- gravamos na tabela genérica `indicadores_externos` (criada em 0004),
-- com fonte 'IBGE-MUNIC'.
--
-- Esta migration é ADITIVA e SP-only por natureza dos dados:
--   - registra a fonte 'IBGE-MUNIC' em `fontes` (FK de indicadores_externos);
--   - NÃO cria tabela nova (o schema de indicadores_externos já serve);
--   - NÃO toca uf_status, vw_municipios_publicados nem o gate nacional.
--
-- Idempotente: INSERT ... ON CONFLICT DO NOTHING. Sem DROP.
-- Vide [[feedback_no_drop_table_in_migrations]].
-- ---------------------------------------------------------------------

-- Fonte dedicada para a MUNIC. Já existe um 'IBGE' genérico (população/PIB);
-- separamos a MUNIC para deixar a proveniência explícita em indicadores_externos.
INSERT INTO fontes (id, operador, url_base, tipo_acesso, cobertura, observacoes) VALUES
  ('IBGE-MUNIC', 'IBGE', 'https://servicodados.ibge.gov.br/api/v3/agregados',
   'REST_API', 'BR todo (perfil dos municípios)',
   'Pesquisa de Informações Básicas Municipais (MUNIC): planos, conselhos, fundos, carreira do magistério e demais indicadores institucionais. Ingestão via pipeline/ibge_munic.py.')
ON CONFLICT (id) DO NOTHING;

-- Mapeamento de indicador (chave em indicadores_externos.indicador) → categoria,
-- útil pra documentação/consulta. Não cria objeto novo; é só referência:
--   plano_diretor                      → gestao
--   plano_municipal_educacao           → educacao
--   plano_municipal_saude              → saude
--   conselho_municipal_educacao_ativo  → educacao
--   conselho_acompanhamento_fundeb     → educacao
--   plano_carreira_magisterio          → educacao
--   fundo_municipal_saude              → saude
-- (categoria gravada pelo pipeline em indicadores_externos.categoria.)
