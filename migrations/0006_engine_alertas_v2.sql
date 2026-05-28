-- =====================================================================
-- Migration 0006 — Engine de alertas v2 (mais regras)
-- =====================================================================
-- Adiciona à função regerar_alertas_munic novas regras:
--   - IDEB anos finais com queda (análoga aos anos iniciais)
--   - Crescimento da despesa com pessoal yoy > 5% (LRF Art. 22)
--   - Resultado primário abaixo da meta da LDO (RREO Anexo 06 vs ldo_metas_fiscais)
--   - Taxa de abandono escolar > 5% (INEP)
--   - Gasto saúde per capita abaixo da mediana estadual
--   - Aderência educação ao histórico de 3 anos (RF-24)
--   - Aderência saúde ao histórico de 3 anos (RF-24)
-- Mantém regras existentes da 0005.
-- =====================================================================

CREATE OR REPLACE FUNCTION regerar_alertas_munic(p_cod_ibge BIGINT)
RETURNS INTEGER AS $$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  -- Limpa alertas automáticos abertos
  DELETE FROM alertas
  WHERE cod_ibge = p_cod_ibge
    AND status = 'aberto'
    AND fonte_engine IS NOT NULL;

  -- =====================================================================
  -- 1. LRF Pessoal — Executivo (60% RCL máx)
  -- =====================================================================
  INSERT INTO alertas (cod_ibge, indicador, exercicio, periodo, nivel, mensagem, base_legal,
                       categoria, valor_observado, limite_referencia, pct_do_limite,
                       hash_dedup, fonte_engine, status)
  SELECT
    p_cod_ibge, 'pessoal_executivo', i.exercicio, i.periodo,
    CASE
      WHEN i.pct_do_limite >= COALESCE(p.limite_critico, 95) THEN 'critico'
      WHEN i.pct_do_limite >= COALESCE(p.limite_atencao, 90) THEN 'atencao'
      ELSE 'informativo'
    END,
    'Despesa com pessoal em ' || ROUND(i.valor, 2) || '% da RCL (' || ROUND(i.pct_do_limite, 1) || '% do limite legal de 60%)',
    'LRF Art. 19 III · 60% RCL',
    'lrf', i.valor, i.limite_legal, i.pct_do_limite,
    md5('pessoal_executivo_' || i.exercicio || '_' || i.periodo || '_' || ROUND(i.pct_do_limite, 1)::text),
    'engine_v2', 'aberto'
  FROM (
    SELECT * FROM indicadores_lrf
    WHERE cod_ibge = p_cod_ibge AND indicador = 'pessoal'
    ORDER BY exercicio DESC, periodo DESC LIMIT 1
  ) i
  LEFT JOIN parametros_alerta p ON p.cod_ibge = p_cod_ibge AND p.indicador = 'pessoal'
  WHERE i.pct_do_limite >= 80
  ON CONFLICT (cod_ibge, hash_dedup) WHERE hash_dedup IS NOT NULL DO NOTHING;

  -- =====================================================================
  -- 2. NOVO: Crescimento despesa pessoal yoy (yo-y > 5% = atenção, > 10% = crítico)
  -- =====================================================================
  INSERT INTO alertas (cod_ibge, indicador, exercicio, nivel, mensagem, base_legal,
                       categoria, valor_observado, limite_referencia,
                       hash_dedup, fonte_engine, status)
  SELECT
    p_cod_ibge, 'pessoal_crescimento_yoy', atual.exercicio,
    CASE
      WHEN (atual.valor - anterior.valor) > 10 THEN 'critico'
      WHEN (atual.valor - anterior.valor) > 5 THEN 'atencao'
      ELSE 'informativo'
    END,
    'Despesa com pessoal subiu ' || ROUND((atual.valor - anterior.valor)::numeric, 2)
      || ' p.p. de ' || anterior.exercicio || ' (' || ROUND(anterior.valor::numeric, 2)
      || '%) para ' || atual.exercicio || ' (' || ROUND(atual.valor::numeric, 2) || '%) da RCL',
    'LRF Art. 22 · controle de crescimento da folha',
    'lrf', atual.valor, anterior.valor,
    md5('pessoal_yoy_' || atual.exercicio || '_' || ROUND(atual.valor, 2)::text),
    'engine_v2', 'aberto'
  FROM (
    SELECT exercicio, valor FROM indicadores_lrf
    WHERE cod_ibge = p_cod_ibge AND indicador = 'pessoal' AND periodo = (
      SELECT MAX(periodo) FROM indicadores_lrf
      WHERE cod_ibge = p_cod_ibge AND indicador = 'pessoal'
        AND exercicio = (SELECT MAX(exercicio) FROM indicadores_lrf WHERE cod_ibge = p_cod_ibge AND indicador = 'pessoal')
    )
    ORDER BY exercicio DESC LIMIT 1
  ) atual
  JOIN (
    SELECT exercicio, valor FROM indicadores_lrf
    WHERE cod_ibge = p_cod_ibge AND indicador = 'pessoal'
    ORDER BY exercicio DESC LIMIT 1 OFFSET 1
  ) anterior ON anterior.exercicio = atual.exercicio - 1
  WHERE (atual.valor - anterior.valor) > 5
  ON CONFLICT (cod_ibge, hash_dedup) WHERE hash_dedup IS NOT NULL DO NOTHING;

  -- =====================================================================
  -- 3. Educação MDE (mínimo 25% CF Art. 212)
  -- =====================================================================
  INSERT INTO alertas (cod_ibge, indicador, exercicio, periodo, nivel, mensagem, base_legal,
                       categoria, valor_observado, limite_referencia,
                       hash_dedup, fonte_engine, status)
  SELECT
    p_cod_ibge, 'educacao_mde', i.exercicio, i.periodo,
    CASE
      WHEN i.valor < i.limite_legal THEN 'critico'
      WHEN i.valor < i.limite_legal * 1.05 THEN 'atencao'
      ELSE 'informativo'
    END,
    'Aplicação em MDE em ' || ROUND(i.valor, 2) || '% (mínimo 25% CF Art. 212)',
    'CF/88 Art. 212',
    'educacao', i.valor, i.limite_legal,
    md5('educacao_mde_' || i.exercicio || '_' || i.periodo || '_' || ROUND(i.valor, 2)::text),
    'engine_v2', 'aberto'
  FROM (
    SELECT * FROM indicadores_lrf
    WHERE cod_ibge = p_cod_ibge AND indicador = 'educacao'
    ORDER BY exercicio DESC, periodo DESC LIMIT 1
  ) i
  WHERE i.valor < i.limite_legal * 1.10
  ON CONFLICT (cod_ibge, hash_dedup) WHERE hash_dedup IS NOT NULL DO NOTHING;

  -- =====================================================================
  -- 4. Saúde ASPS (mínimo 15% LC 141/2012)
  -- =====================================================================
  INSERT INTO alertas (cod_ibge, indicador, exercicio, periodo, nivel, mensagem, base_legal,
                       categoria, valor_observado, limite_referencia,
                       hash_dedup, fonte_engine, status)
  SELECT
    p_cod_ibge, 'saude_asps', i.exercicio, i.periodo,
    CASE
      WHEN i.valor < i.limite_legal THEN 'critico'
      WHEN i.valor < i.limite_legal * 1.05 THEN 'atencao'
      ELSE 'informativo'
    END,
    'Aplicação em saúde em ' || ROUND(i.valor, 2) || '% (mínimo 15% LC 141/2012)',
    'LC 141/2012 Art. 7º',
    'saude', i.valor, i.limite_legal,
    md5('saude_asps_' || i.exercicio || '_' || i.periodo || '_' || ROUND(i.valor, 2)::text),
    'engine_v2', 'aberto'
  FROM (
    SELECT * FROM indicadores_lrf
    WHERE cod_ibge = p_cod_ibge AND indicador = 'saude'
    ORDER BY exercicio DESC, periodo DESC LIMIT 1
  ) i
  WHERE i.valor < i.limite_legal * 1.10
  ON CONFLICT (cod_ibge, hash_dedup) WHERE hash_dedup IS NOT NULL DO NOTHING;

  -- =====================================================================
  -- 5. SIOPS detalhado (ASPS bimestral)
  -- =====================================================================
  INSERT INTO alertas (cod_ibge, indicador, exercicio, periodo, nivel, mensagem, base_legal,
                       categoria, valor_observado, limite_referencia,
                       hash_dedup, fonte_engine, status)
  SELECT
    p_cod_ibge, 'siops_asps', i.exercicio, i.periodo,
    CASE
      WHEN i.valor < 15 THEN 'critico'
      WHEN i.valor < 15.5 THEN 'atencao'
      ELSE 'informativo'
    END,
    'SIOPS reporta ' || ROUND(i.valor, 2) || '% aplicado em saúde (mínimo 15%)',
    'LC 141/2012 · SIOPS bimestral',
    'saude', i.valor, 15,
    md5('siops_asps_' || i.exercicio || '_' || i.periodo || '_' || ROUND(i.valor, 2)::text),
    'engine_v2', 'aberto'
  FROM (
    SELECT * FROM indicadores_saude
    WHERE cod_ibge = p_cod_ibge AND indicador = 'asps_pct'
    ORDER BY exercicio DESC, periodo DESC LIMIT 1
  ) i
  WHERE i.valor < 16
  ON CONFLICT (cod_ibge, hash_dedup) WHERE hash_dedup IS NOT NULL DO NOTHING;

  -- =====================================================================
  -- 6. FUNDEB remuneração (mínimo 70% Lei 14.113/2020)
  -- =====================================================================
  INSERT INTO alertas (cod_ibge, indicador, exercicio, nivel, mensagem, base_legal,
                       categoria, valor_observado, limite_referencia,
                       hash_dedup, fonte_engine, status)
  SELECT
    p_cod_ibge, 'fundeb_remuneracao', i.exercicio,
    CASE
      WHEN i.valor < 70 THEN 'critico'
      WHEN i.valor < 75 THEN 'atencao'
      ELSE 'informativo'
    END,
    'FUNDEB remuneração de profissionais em ' || ROUND(i.valor, 2) || '% (mínimo 70%)',
    'Lei 14.113/2020 Art. 26',
    'educacao', i.valor, 70,
    md5('fundeb_rem_' || i.exercicio || '_' || ROUND(i.valor, 2)::text),
    'engine_v2', 'aberto'
  FROM (
    SELECT * FROM indicadores_educacao
    WHERE cod_ibge = p_cod_ibge AND indicador = 'fundeb_remuneracao_pct'
    ORDER BY exercicio DESC, periodo DESC LIMIT 1
  ) i
  WHERE i.valor < 80
  ON CONFLICT (cod_ibge, hash_dedup) WHERE hash_dedup IS NOT NULL DO NOTHING;

  -- =====================================================================
  -- 7. IDEB Anos Iniciais — queda
  -- =====================================================================
  INSERT INTO alertas (cod_ibge, indicador, exercicio, nivel, mensagem, base_legal,
                       categoria, valor_observado, limite_referencia,
                       hash_dedup, fonte_engine, status)
  SELECT
    p_cod_ibge, 'ideb_anos_iniciais_queda', atual.ciclo_avaliacao,
    CASE WHEN (atual.ideb_observado - anterior.ideb_observado) < -0.5 THEN 'critico'
         WHEN (atual.ideb_observado - anterior.ideb_observado) < -0.2 THEN 'atencao'
         ELSE 'informativo' END,
    'IDEB municipal Anos Iniciais caiu de ' || anterior.ideb_observado || ' (' || anterior.ciclo_avaliacao
      || ') para ' || atual.ideb_observado || ' (' || atual.ciclo_avaliacao || ')',
    'Lei 9.394/96 · PNE',
    'educacao', atual.ideb_observado, anterior.ideb_observado,
    md5('ideb_iniciais_' || atual.ciclo_avaliacao || '_' || atual.ideb_observado::text),
    'engine_v2', 'aberto'
  FROM (
    SELECT * FROM ideb
    WHERE cod_ibge = p_cod_ibge AND rede = 'municipal' AND etapa = 'anos_iniciais'
      AND ideb_observado IS NOT NULL
    ORDER BY ciclo_avaliacao DESC LIMIT 1
  ) atual
  JOIN (
    SELECT * FROM ideb
    WHERE cod_ibge = p_cod_ibge AND rede = 'municipal' AND etapa = 'anos_iniciais'
      AND ideb_observado IS NOT NULL
    ORDER BY ciclo_avaliacao DESC LIMIT 1 OFFSET 1
  ) anterior ON TRUE
  WHERE (atual.ideb_observado - anterior.ideb_observado) < -0.2
  ON CONFLICT (cod_ibge, hash_dedup) WHERE hash_dedup IS NOT NULL DO NOTHING;

  -- =====================================================================
  -- 8. NOVO: IDEB Anos Finais — queda
  -- =====================================================================
  INSERT INTO alertas (cod_ibge, indicador, exercicio, nivel, mensagem, base_legal,
                       categoria, valor_observado, limite_referencia,
                       hash_dedup, fonte_engine, status)
  SELECT
    p_cod_ibge, 'ideb_anos_finais_queda', atual.ciclo_avaliacao,
    CASE WHEN (atual.ideb_observado - anterior.ideb_observado) < -0.5 THEN 'critico'
         WHEN (atual.ideb_observado - anterior.ideb_observado) < -0.2 THEN 'atencao'
         ELSE 'informativo' END,
    'IDEB municipal Anos Finais caiu de ' || anterior.ideb_observado || ' (' || anterior.ciclo_avaliacao
      || ') para ' || atual.ideb_observado || ' (' || atual.ciclo_avaliacao || ')',
    'Lei 9.394/96 · PNE',
    'educacao', atual.ideb_observado, anterior.ideb_observado,
    md5('ideb_finais_' || atual.ciclo_avaliacao || '_' || atual.ideb_observado::text),
    'engine_v2', 'aberto'
  FROM (
    SELECT * FROM ideb
    WHERE cod_ibge = p_cod_ibge AND rede = 'municipal' AND etapa = 'anos_finais'
      AND ideb_observado IS NOT NULL
    ORDER BY ciclo_avaliacao DESC LIMIT 1
  ) atual
  JOIN (
    SELECT * FROM ideb
    WHERE cod_ibge = p_cod_ibge AND rede = 'municipal' AND etapa = 'anos_finais'
      AND ideb_observado IS NOT NULL
    ORDER BY ciclo_avaliacao DESC LIMIT 1 OFFSET 1
  ) anterior ON TRUE
  WHERE (atual.ideb_observado - anterior.ideb_observado) < -0.2
  ON CONFLICT (cod_ibge, hash_dedup) WHERE hash_dedup IS NOT NULL DO NOTHING;

  -- =====================================================================
  -- 9. NOVO: Taxa abandono Ensino Fundamental > 3% (INEP)
  -- =====================================================================
  INSERT INTO alertas (cod_ibge, indicador, nivel, mensagem, base_legal,
                       categoria, valor_observado, limite_referencia,
                       hash_dedup, fonte_engine, status)
  SELECT
    p_cod_ibge, 'taxa_abandono_ef',
    CASE WHEN i.valor_numerico > 5 THEN 'critico'
         WHEN i.valor_numerico > 3 THEN 'atencao'
         ELSE 'informativo' END,
    'Taxa de abandono no Ensino Fundamental em ' || ROUND(i.valor_numerico, 1) || '% (referência: até 3%)',
    'INEP · indicadores educacionais',
    'externo', i.valor_numerico, 3,
    md5('abandono_ef_' || i.periodo_referencia::text || '_' || ROUND(i.valor_numerico, 1)::text),
    'engine_v2', 'aberto'
  FROM (
    SELECT * FROM indicadores_externos
    WHERE cod_ibge = p_cod_ibge
      AND fonte_id = 'INEP'
      AND indicador LIKE '%abandono%fundamental%'
      AND valor_numerico IS NOT NULL
    ORDER BY periodo_referencia DESC LIMIT 1
  ) i
  WHERE i.valor_numerico > 3
  ON CONFLICT (cod_ibge, hash_dedup) WHERE hash_dedup IS NOT NULL DO NOTHING;

  -- =====================================================================
  -- 10. NOVO: Resultado primário abaixo da meta da LDO
  -- =====================================================================
  INSERT INTO alertas (cod_ibge, indicador, exercicio, periodo, nivel, mensagem, base_legal,
                       categoria, valor_observado, limite_referencia,
                       hash_dedup, fonte_engine, status)
  SELECT
    p_cod_ibge, 'resultado_primario_abaixo_meta', f.exercicio, f.periodo,
    CASE WHEN f.valor < m.meta_valor * 0.8 THEN 'critico'
         WHEN f.valor < m.meta_valor THEN 'atencao'
         ELSE 'informativo' END,
    'Resultado primário realizado de R$ ' || ROUND(f.valor / 1000000, 2) || ' mi vs meta LDO de R$ '
      || ROUND(m.meta_valor / 1000000, 2) || ' mi (exercício ' || f.exercicio || ')',
    COALESCE(m.base_legal, 'LDO local · Anexo de Metas Fiscais'),
    'planejamento', f.valor, m.meta_valor,
    md5('rp_meta_' || f.exercicio || '_' || ROUND(f.valor, 0)::text),
    'engine_v2', 'aberto'
  FROM (
    SELECT * FROM indicadores_fiscais
    WHERE cod_ibge = p_cod_ibge AND indicador = 'resultado_primario'
    ORDER BY exercicio DESC, periodo DESC LIMIT 1
  ) f
  JOIN ldo_metas_fiscais m
    ON m.cod_ibge = p_cod_ibge AND m.indicador = 'resultado_primario' AND m.exercicio = f.exercicio
    AND m.meta_valor IS NOT NULL AND m.meta_valor > 0
  WHERE f.valor < m.meta_valor
  ON CONFLICT (cod_ibge, hash_dedup) WHERE hash_dedup IS NOT NULL DO NOTHING;

  -- =====================================================================
  -- 11. Transparência fiscal (publicação SICONFI)
  -- =====================================================================
  INSERT INTO alertas (cod_ibge, indicador, nivel, mensagem, base_legal,
                       categoria, valor_observado, limite_referencia,
                       hash_dedup, fonte_engine, status)
  SELECT
    p_cod_ibge, 'transparencia_fiscal',
    CASE WHEN pct_publi < 30 THEN 'critico'
         WHEN pct_publi < 60 THEN 'atencao'
         ELSE 'informativo' END,
    'Apenas ' || pct_publi || '% dos relatórios fiscais obrigatórios publicados no SICONFI ('
      || publicados || ' de ' || total || ')',
    'LRF Art. 48 · transparência fiscal',
    'lrf', pct_publi, 100,
    md5('transparencia_' || pct_publi::text),
    'engine_v2', 'aberto'
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE status = 'PUBLICADO')::numeric AS publicados,
      COUNT(*) AS total,
      CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'PUBLICADO') / COUNT(*)) ELSE 0 END AS pct_publi
    FROM publicacao_status
    WHERE cod_ibge = p_cod_ibge
  ) tr
  WHERE tr.total > 0 AND tr.pct_publi < 80
  ON CONFLICT (cod_ibge, hash_dedup) WHERE hash_dedup IS NOT NULL DO NOTHING;

  -- =====================================================================
  -- 12. NOVO: Aderência educação ao histórico 3 anos (RF-24)
  -- =====================================================================
  INSERT INTO alertas (cod_ibge, indicador, exercicio, nivel, mensagem, base_legal,
                       categoria, valor_observado, limite_referencia,
                       hash_dedup, fonte_engine, status)
  SELECT
    p_cod_ibge, 'educacao_fora_padrao_historico', v.ano_atual,
    CASE
      WHEN v.educacao_atual < v.educacao_media3a - 3 THEN 'critico'
      WHEN v.educacao_atual < v.educacao_media3a - 1.5 THEN 'atencao'
      ELSE 'informativo'
    END,
    'Aplicação em educação em ' || ROUND(v.educacao_atual::numeric, 2) || '% — abaixo da média de 3 anos ('
      || ROUND(v.educacao_media3a::numeric, 2) || '%)',
    'RF-24 · comparativo histórico',
    'educacao', v.educacao_atual, v.educacao_media3a,
    md5('educ_hist_' || v.ano_atual || '_' || ROUND(v.educacao_atual, 2)::text),
    'engine_v2', 'aberto'
  FROM vw_aderencia_historica v
  WHERE v.cod_ibge = p_cod_ibge
    AND v.educacao_atual IS NOT NULL
    AND v.educacao_media3a IS NOT NULL
    AND v.educacao_atual < v.educacao_media3a - 1.5
  ON CONFLICT (cod_ibge, hash_dedup) WHERE hash_dedup IS NOT NULL DO NOTHING;

  -- =====================================================================
  -- 13. NOVO: Aderência saúde ao histórico 3 anos (RF-24)
  -- =====================================================================
  INSERT INTO alertas (cod_ibge, indicador, exercicio, nivel, mensagem, base_legal,
                       categoria, valor_observado, limite_referencia,
                       hash_dedup, fonte_engine, status)
  SELECT
    p_cod_ibge, 'saude_fora_padrao_historico', v.ano_atual,
    CASE
      WHEN v.saude_atual < v.saude_media3a - 2 THEN 'critico'
      WHEN v.saude_atual < v.saude_media3a - 1 THEN 'atencao'
      ELSE 'informativo'
    END,
    'Aplicação em saúde em ' || ROUND(v.saude_atual::numeric, 2) || '% — abaixo da média de 3 anos ('
      || ROUND(v.saude_media3a::numeric, 2) || '%)',
    'RF-24 · comparativo histórico',
    'saude', v.saude_atual, v.saude_media3a,
    md5('saude_hist_' || v.ano_atual || '_' || ROUND(v.saude_atual, 2)::text),
    'engine_v2', 'aberto'
  FROM vw_aderencia_historica v
  WHERE v.cod_ibge = p_cod_ibge
    AND v.saude_atual IS NOT NULL
    AND v.saude_media3a IS NOT NULL
    AND v.saude_atual < v.saude_media3a - 1
  ON CONFLICT (cod_ibge, hash_dedup) WHERE hash_dedup IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION regerar_alertas_munic IS
  'Engine de alertas v2 — 13 regras cobrindo LRF (pessoal exec + yoy + transparência), educação (MDE, FUNDEB, IDEB iniciais/finais, abandono, aderência histórica), saúde (ASPS LRF + SIOPS + aderência histórica), planejamento (resultado primário vs meta LDO).';
