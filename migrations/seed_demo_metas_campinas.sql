-- =====================================================================
-- SEED DEMO — Metas físicas de Campinas (cod_ibge 3509502)
-- =====================================================================
-- ⚠️ DADOS FICTÍCIOS DE DEMONSTRAÇÃO. NÃO É CARGA REAL.
--
-- Objetivo: popular programas/acoes/metas_fisicas SÓ para Campinas (SP) de
-- modo que os painéis por papel (PainelMetasPasta) e a tela de cadastro de
-- metas físicas possam ser CONSTRUÍDOS e VALIDADOS antes da carga real.
--
-- A carga real dos 645 municípios vem do TCE-SP (Audesp) via outro PR — ela
-- substitui estes dados. Este seed é idempotente (ON CONFLICT DO NOTHING) e
-- pode ser re-aplicado sem duplicar.
--
-- Usa as colunas de 0009: metas_fisicas.status_acompanhamento,
-- bimestre_referencia, responsavel_area; e programas.orgao_id.
-- NÃO toca uf_status nem o gate nacional.
-- =====================================================================

BEGIN;

-- 4 programas (Educação, Saúde, Assistência Social, Urbanismo) ---------
-- exercicio 2025 (PPA de referência).
INSERT INTO programas (cod_ibge, exercicio, codigo, nome, objetivo, area, publico_alvo)
VALUES
  (3509502, 2025, 'DEMO-EDU', 'Educação Básica de Qualidade',
   'Ampliar e qualificar a oferta de educação básica.', 'Educação',
   'Crianças e adolescentes de 0 a 17 anos'),
  (3509502, 2025, 'DEMO-SAU', 'Atenção à Saúde da População',
   'Garantir acesso integral aos serviços de saúde.', 'Saúde',
   'População usuária do SUS'),
  (3509502, 2025, 'DEMO-AST', 'Proteção Social Básica e Especial',
   'Fortalecer a rede socioassistencial do município.', 'Assistência Social',
   'Famílias em situação de vulnerabilidade'),
  (3509502, 2025, 'DEMO-URB', 'Mobilidade e Infraestrutura Urbana',
   'Melhorar a infraestrutura e a mobilidade urbana.', 'Urbanismo',
   'População do município')
ON CONFLICT (cod_ibge, exercicio, codigo) DO NOTHING;

-- ~2-3 ações por programa ---------------------------------------------
INSERT INTO acoes (programa_id, codigo, nome, produto, unidade_medida)
SELECT p.id, v.codigo, v.nome, v.produto, v.unidade_medida
FROM (VALUES
  -- Educação
  ('DEMO-EDU', '2001', 'Construção de creches', 'Creche entregue', 'unidade'),
  ('DEMO-EDU', '2002', 'Matrículas em tempo integral', 'Aluno em tempo integral', 'aluno'),
  ('DEMO-EDU', '2003', 'Distribuição de material didático', 'Kit entregue', 'kit'),
  -- Saúde
  ('DEMO-SAU', '3001', 'Consultas de atenção básica', 'Consulta realizada', 'consulta'),
  ('DEMO-SAU', '3002', 'Cobertura vacinal infantil', 'Criança imunizada', 'criança'),
  -- Assistência Social
  ('DEMO-AST', '4001', 'Atendimento em CRAS', 'Família acompanhada', 'família'),
  ('DEMO-AST', '4002', 'Benefícios eventuais concedidos', 'Benefício concedido', 'benefício'),
  ('DEMO-AST', '4003', 'Vagas em acolhimento institucional', 'Vaga ofertada', 'vaga'),
  -- Urbanismo
  ('DEMO-URB', '5001', 'Recapeamento de vias', 'Via recapeada', 'km'),
  ('DEMO-URB', '5002', 'Iluminação pública em LED', 'Ponto de luz convertido', 'ponto')
) AS v(prog_codigo, codigo, nome, produto, unidade_medida)
JOIN programas p
  ON p.cod_ibge = 3509502 AND p.exercicio = 2025 AND p.codigo = v.prog_codigo
ON CONFLICT (programa_id, codigo) DO NOTHING;

-- metas_fisicas 2024 e 2025 com status variados -----------------------
-- status_acompanhamento: pendente | preenchido | notificado | escalonado
INSERT INTO metas_fisicas
  (acao_id, exercicio, meta_quantidade, realizado_quantidade,
   observacoes, status_acompanhamento, bimestre_referencia, responsavel_area)
SELECT a.id, v.exercicio, v.meta_q, v.real_q, v.obs, v.status, v.bim, v.resp
FROM (VALUES
  -- prog, acao, exercicio, meta, realizado, status, bimestre, responsavel, obs
  ('DEMO-EDU', '2001', 2024, 6,       6,      'preenchido', 6, 'Secretaria de Educação', 'Meta cumprida.'),
  ('DEMO-EDU', '2001', 2025, 8,       3,      'pendente',   2, 'Secretaria de Educação', NULL),
  ('DEMO-EDU', '2002', 2024, 12000,   11800,  'preenchido', 6, 'Secretaria de Educação', NULL),
  ('DEMO-EDU', '2002', 2025, 15000,   4200,   'notificado', 1, 'Secretaria de Educação', 'Abaixo do esperado no 1º bimestre.'),
  ('DEMO-EDU', '2003', 2025, 50000,   0,      'pendente',   1, 'Secretaria de Educação', NULL),
  -- Saúde
  ('DEMO-SAU', '3001', 2024, 480000,  462000, 'preenchido', 6, 'Secretaria de Saúde', NULL),
  ('DEMO-SAU', '3001', 2025, 500000,  120000, 'preenchido', 2, 'Secretaria de Saúde', NULL),
  ('DEMO-SAU', '3002', 2025, 30000,   9000,   'escalonado', 1, 'Secretaria de Saúde', 'Cobertura crítica — escalonado à gestão.'),
  -- Assistência Social
  ('DEMO-AST', '4001', 2024, 8000,    7500,   'preenchido', 6, 'Secretaria de Assistência Social', NULL),
  ('DEMO-AST', '4002', 2025, 12000,   3100,   'pendente',   2, 'Secretaria de Assistência Social', NULL),
  ('DEMO-AST', '4003', 2025, 120,     45,     'notificado', 1, 'Secretaria de Assistência Social', NULL),
  -- Urbanismo
  ('DEMO-URB', '5001', 2024, 40,      38,     'preenchido', 6, 'Secretaria de Obras', NULL),
  ('DEMO-URB', '5001', 2025, 50,      0,      'escalonado', 1, 'Secretaria de Obras', 'Sem execução no 1º bimestre.'),
  ('DEMO-URB', '5002', 2025, 20000,   8500,   'pendente',   2, 'Secretaria de Obras', NULL)
) AS v(prog_codigo, acao_codigo, exercicio, meta_q, real_q, status, bim, resp, obs)
JOIN programas p
  ON p.cod_ibge = 3509502 AND p.exercicio = 2025 AND p.codigo = v.prog_codigo
JOIN acoes a
  ON a.programa_id = p.id AND a.codigo = v.acao_codigo
ON CONFLICT (acao_id, exercicio) DO NOTHING;

COMMIT;
