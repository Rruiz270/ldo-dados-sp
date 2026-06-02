#!/usr/bin/env python3
"""
SICONFI/Audesp → Neon DB sync
==============================
Lê os arquivos JSON/CSV produzidos pelos scrapers e faz UPSERT no Neon
(banco do projeto ldo-dados-sp). Idempotente — pode rodar quantas vezes
quiser, só atualiza o que mudou.

Uso:
  export DATABASE_URL="postgresql://..."  # ou defina em .env
  python3 sync_to_neon.py

Mapeamento Postgres:
  municipios          ← municipios_sp.json
  publicacao_status   ← *.status.json
  indicadores_lrf     ← RGF (pessoal, dívida) + RREO (RCL) + Audesp (educ, saúde)
"""

import csv
import json
import os
import sys
import zipfile
from collections import defaultdict
from datetime import datetime
from io import StringIO

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERRO: psycopg2 não instalado. Rode: python3 -m pip install --user psycopg2-binary")
    sys.exit(1)

BASE = os.path.dirname(os.path.abspath(__file__))
SICONFI_DIR = os.path.join(BASE, "siconfi_data")
AUDESP_DIR = os.path.join(BASE, "audesp_data")

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    # Tenta ler do .env.local do projeto Next.js
    envpath = "/Users/raphaelruiz/Projects/ldo-dados-sp/.env.local"
    if os.path.exists(envpath):
        with open(envpath) as f:
            for line in f:
                if line.startswith("DATABASE_URL="):
                    DATABASE_URL = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
if not DATABASE_URL:
    print("ERRO: DATABASE_URL não definido")
    sys.exit(1)


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


# --------------------------------------------------------------------
# Carregadores de arquivo
# --------------------------------------------------------------------

def load_municipios():
    """Carrega o cache de municípios do SICONFI.

    Default = municipios_sp.json (legado SP). Durante a expansão nacional, o
    estado-alvo vem de env SICONFI_UFS (mesma var do siconfi_scraper.py):
      SICONFI_UFS=SP  → municipios_sp.json
      SICONFI_UFS=AC  → municipios_ac.json
      SICONFI_UFS=ALL → municipios_br.json
    """
    ufs = [u.strip().upper() for u in os.environ.get("SICONFI_UFS", "SP").split(",") if u.strip()]
    if ufs == ["SP"]:
        name = "municipios_sp.json"
    elif ufs == ["ALL"]:
        name = "municipios_br.json"
    else:
        name = f"municipios_{'_'.join(u.lower() for u in ufs)}.json"
    path = os.path.join(SICONFI_DIR, name)
    with open(path) as f:
        return json.load(f)


def load_status_maps():
    """Retorna dict {dataset: {cod_ibge: status}}."""
    out = {}
    for f in sorted(os.listdir(SICONFI_DIR)):
        if not f.endswith(".status.json"):
            continue
        dataset = f.replace(".status.json", "")
        with open(os.path.join(SICONFI_DIR, f)) as fh:
            data = json.load(fh)
        out[dataset] = {int(k): v for k, v in data.items()}
    return out


def iter_json_records(filename):
    """Itera registros de um JSON de extração SICONFI."""
    path = os.path.join(SICONFI_DIR, filename)
    if not os.path.exists(path):
        return
    with open(path) as f:
        items = json.load(f)
    for it in items:
        yield it


def extract_rcl(rreo_file):
    """RREO Anexo 03 → RCL por município.
    Padrão SICONFI: anexo='RREO-Anexo 03', coluna='TOTAL', conta='RECEITA CORRENTE LIQUIDA'.
    """
    out = {}
    for r in iter_json_records(rreo_file):
        if r.get("anexo") != "RREO-Anexo 03":
            continue
        conta = (r.get("conta") or "").upper()
        coluna = (r.get("coluna") or "").upper()
        # RCL: a conta-síntese vem como "RECEITA CORRENTE LÍQUIDA" na coluna TOTAL (últimos 12 meses)
        if "RECEITA CORRENTE LIQUIDA" in conta and "TOTAL" in coluna and "AJUSTADA" not in conta:
            out[r["cod_ibge"]] = float(r["valor"])
    return out


def extract_pessoal(rgf_file):
    """RGF Anexo 01 → % da DTP sobre RCL.
    Conta 'DESPESA TOTAL COM PESSOAL' coluna '% SOBRE A RCL' (ou similar).
    """
    out = {}
    for r in iter_json_records(rgf_file):
        if r.get("anexo") != "RGF-Anexo 01":
            continue
        conta = (r.get("conta") or "").upper()
        coluna = (r.get("coluna") or "").upper()
        # Pegamos o % consolidado: DTP / RCL
        if ("DESPESA TOTAL COM PESSOAL" in conta or "DESPESA TOTAL DE PESSOAL" in conta) and "%" in coluna:
            out[r["cod_ibge"]] = float(r["valor"])
    return out


def _to_float(v):
    """float() tolerante (None/'' → None)."""
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _quad_col(q):
    """Rótulo da coluna do quadrimestre corrente no RGF (Anexos 02 e 03).
    O SICONFI usa 'Até o Nº Quadrimestre' (acumulado até o período processado),
    NÃO 'SALDO DO EXERCÍCIO ANTERIOR'."""
    return f"Até o {int(q)}º Quadrimestre"


def _is_pct_col(coluna):
    """True se a coluna já expressa um % (sobre a RCL/RCL ajustada), não R$.
    O RGF traz colunas '% SOBRE A RCL' ou '% SOBRE A RCL AJUSTADA' nos anexos
    02 e 04 (linhas de percentual prontas)."""
    return "%" in (coluna or "").upper()


def extract_divida(rgf_file, q):
    """RGF Anexo 02 → % da DCL sobre a RCL ajustada (limite 120%).

    O % vem PRONTO no cod_conta 'PercentualDaDCLSobreARCL' (DCL — com 'L'; NÃO
    'PercentualDaDCSobreARCL', que é a Dívida Consolidada bruta). O valor é
    quadrimestral por COLUNA: pegamos 'Até o {q}º Quadrimestre' (período corrente),
    nunca 'SALDO DO EXERCÍCIO ANTERIOR'.

    Fallback (layout sem o % pronto): computa DCL R$ ÷ RCL R$ × 100 na mesma coluna.
    Confirmado contra a API: Campinas (3509502) 2025 Q2 → 7,88%.
    """
    quad = _quad_col(q)
    pct_pronto = {}     # cod_ibge → % pronto (DCL sobre RCL ajustada)
    dcl_rs = {}         # cod_ibge → DCL em R$ (coluna do quadrimestre)
    rcl_rs = {}         # cod_ibge → RCL em R$ (coluna do quadrimestre)
    for r in iter_json_records(rgf_file):
        if r.get("anexo") != "RGF-Anexo 02":
            continue
        if (r.get("coluna") or "") != quad:
            continue
        cod = r["cod_ibge"]
        codc = r.get("cod_conta") or ""
        val = _to_float(r.get("valor"))
        if val is None:
            continue
        if codc == "PercentualDaDCLSobreARCL":
            pct_pronto[cod] = val
        elif codc == "DividaConsolidadaLiquida":
            dcl_rs[cod] = val
        elif codc in ("RGF2ReceitaCorrenteLiquida",
                      "ReceitaCorrenteLiquidaAjustadaParaCalculoDosLimitesDeEndividamento"):
            # Prioriza a RCL ajustada (denominador legal); só usa a bruta se faltar
            if codc == "ReceitaCorrenteLiquidaAjustadaParaCalculoDosLimitesDeEndividamento" \
                    or cod not in rcl_rs:
                rcl_rs[cod] = val

    out = {}
    for cod in set(pct_pronto) | set(dcl_rs):
        if cod in pct_pronto:
            out[cod] = pct_pronto[cod]
        elif rcl_rs.get(cod):
            out[cod] = round(dcl_rs[cod] / rcl_rs[cod] * 100.0, 4)
    return out


def extract_garantias(rgf_file, q):
    """RGF Anexo 03 → Garantias concedidas / RCL (limite 22%).

    O anexo NÃO traz coluna de '% sobre a RCL' — só valores R$ por quadrimestre.
    Então COMPUTAMOS: total de garantias concedidas (R$) ÷ RCL (R$) × 100, ambos
    na coluna do quadrimestre corrente ('Até o {q}º Quadrimestre').

    Município raramente concede garantia: quando não há linha-total de garantias
    (ex.: Campinas), o % é 0. A RCL está em cod_conta 'RGF3ReceitaCorrenteLiquida'.
    """
    quad = _quad_col(q)
    rcl_rs = {}                       # cod_ibge → RCL R$
    garantias_rs = defaultdict(float)  # cod_ibge → total garantias concedidas R$
    tem_muni = set()                  # munis presentes no anexo (p/ gravar 0)
    for r in iter_json_records(rgf_file):
        if r.get("anexo") != "RGF-Anexo 03":
            continue
        if (r.get("coluna") or "") != quad:
            continue
        cod = r["cod_ibge"]
        tem_muni.add(cod)
        codc = r.get("cod_conta") or ""
        conta = (r.get("conta") or "").upper()
        val = _to_float(r.get("valor"))
        if val is None:
            continue
        if codc == "RGF3ReceitaCorrenteLiquida":
            rcl_rs[cod] = val
            continue
        # Linha-total de garantias concedidas. O layout do anexo 03 expõe a síntese
        # como 'TOTAL DAS GARANTIAS CONCEDIDAS' (cod_conta com 'Total'+'Garantia').
        cu = codc.upper()
        is_total_garantia = (
            ("TOTAL" in cu and "GARANTIA" in cu and "CONTRAGARANTIA" not in cu)
            or "TOTAL DAS GARANTIAS CONCEDIDAS" in conta
            or "TOTAL GARANTIAS CONCEDIDAS" in conta
        )
        if is_total_garantia:
            garantias_rs[cod] += val

    out = {}
    for cod in tem_muni:
        rcl = rcl_rs.get(cod)
        if not rcl:
            continue
        out[cod] = round(garantias_rs.get(cod, 0.0) / rcl * 100.0, 4)
    return out


def extract_operacoes_e_aro(rgf_file, q):
    """RGF Anexo 04 → Operações de crédito (16%), comprometimento (11,5%) e ARO (7%).
    Retorna {cod_ibge: {operacoes_credito, comprometimento_credito, aro}}.

    Layout real (validado contra a API): o anexo traz o % PRONTO para o total de
    operações de crédito em cod_conta
    'TotalConsideradoParaFinsDaApuracaoDoCumprimentoDoLimiteOperacoesDeCredito'
    na coluna '% SOBRE A RCL AJUSTADA' (linhas de LIMITE são ignoradas). Quando o %
    pronto não existir, COMPUTAMOS o montante R$ ÷ RCL ajustada R$ × 100.

    ARO e comprometimento aparecem como linhas próprias só quando há valor; ausentes
    (ex.: Campinas) ⇒ 0. As linhas 'LIMITE ...' (cod_conta com 'Limite') são tetos,
    não realizações — descartadas.
    """
    out = defaultdict(dict)
    # buffers p/ fallback computado (valores R$ por município)
    opcred_rs = {}    # montante total de operações de crédito apurado p/ o limite
    aro_rs = defaultdict(float)
    compr_rs = defaultdict(float)
    rcl_aj_rs = {}    # RCL ajustada R$

    for r in iter_json_records(rgf_file):
        if r.get("anexo") != "RGF-Anexo 04":
            continue
        codc = r.get("cod_conta") or ""
        cu = codc.upper()
        conta = (r.get("conta") or "").upper()
        coluna = r.get("coluna") or ""
        cod = r["cod_ibge"]
        val = _to_float(r.get("valor"))
        if val is None:
            continue

        # Linhas de LIMITE são tetos legais, não realizações → ignorar.
        # Filtra só pelo cod_conta (começa com 'Limite'); NÃO pelo texto da conta,
        # pois a linha-total legítima contém 'APURAÇÃO DO CUMPRIMENTO DO LIMITE'.
        if cu.startswith("LIMITE"):
            continue

        is_pct = _is_pct_col(coluna)

        # --- Operações de crédito: total apurado p/ o limite (VIII) ---
        if codc == "TotalConsideradoParaFinsDaApuracaoDoCumprimentoDoLimiteOperacoesDeCredito":
            if is_pct:
                out[cod]["operacoes_credito"] = val
            else:
                opcred_rs[cod] = val
            continue

        # RCL ajustada (denominador p/ fallback computado)
        if codc == "ReceitaCorrenteLiquidaAjustadaParaCalculoDosLimitesDeEndividamento":
            rcl_aj_rs[cod] = val
            continue
        if codc == "RGF4ReceitaCorrenteLiquida" and cod not in rcl_aj_rs:
            rcl_aj_rs[cod] = val
            continue

        # --- ARO (operações por antecipação da receita orçamentária) realizado ---
        is_aro = ("ANTECIPA" in cu and "RECEITA" in cu) or "ARO" in cu \
            or ("ANTECIPA" in conta and "RECEITA" in conta)
        if is_aro:
            if is_pct:
                out[cod]["aro"] = val
            else:
                aro_rs[cod] += val
            continue

        # --- Comprometimento anual (amortizações/juros/encargos) ---
        if "COMPROMETIMENTO" in cu or "COMPROMETIMENTO" in conta:
            if is_pct:
                out[cod]["comprometimento_credito"] = val
            else:
                compr_rs[cod] += val
            continue

    # Computa % a partir dos R$ quando não veio % pronto
    for cod, rcl in rcl_aj_rs.items():
        if not rcl:
            continue
        if "operacoes_credito" not in out[cod] and cod in opcred_rs:
            out[cod]["operacoes_credito"] = round(opcred_rs[cod] / rcl * 100.0, 4)
        if "aro" not in out[cod] and cod in aro_rs:
            out[cod]["aro"] = round(aro_rs[cod] / rcl * 100.0, 4)
        if "comprometimento_credito" not in out[cod] and cod in compr_rs:
            out[cod]["comprometimento_credito"] = round(compr_rs[cod] / rcl * 100.0, 4)

    return out


def _br_decimal(s):
    """Converte número estilo BR (vírgula decimal) pra float. None se vazio/inválido."""
    if s is None:
        return None
    s = str(s).strip().replace(".", "").replace(",", ".")  # remove thousand sep e troca decimal
    if not s or s in ("-", "null"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def load_audesp_analises_rows():
    """Lê resultado_analises_audesp.csv (Audesp Fase IV consolidado pelo TCE-SP).
    Schema (latin-1, separador ';'):
      Exercício; Código IBGE; Município;
      Resultado da Execução Orçamentária (Valor); (%);
      Despesa Empenhada FUNDEB (%); FUNDEB Profissionais Educação (%);
      Despesa Empenhada Ensino; (%); Saúde; (%);
      Despesa com Pessoal Poder Executivo; (%).

    Retorna lista de tuplas pra indicadores_lrf:
      (cod_ibge, exercicio, periodo, periodicidade, indicador,
       valor, base_calculo, limite_legal, pct_do_limite, fonte)
    """
    zpath = os.path.join(AUDESP_DIR, "analises", "resultado_analises_audesp.zip")
    if not os.path.exists(zpath):
        log("  audesp analises: arquivo não encontrado, pulando")
        return []

    with zipfile.ZipFile(zpath) as z:
        with z.open(z.namelist()[0]) as f:
            text = f.read().decode("latin-1")

    reader = csv.DictReader(StringIO(text), delimiter=";")
    rows = []

    # Mapeamento (nome_coluna_csv, indicador, limite_legal, prudencial, alerta)
    # Tetos (alto=ruim) vs pisos (alto=bom) são lidos do catálogo na UI; aqui só
    # gravamos os limites/faixas que a lei define. Faixas (prudencial/alerta) só
    # existem onde a LRF prevê: pessoal (57/54). Demais → None.
    MAPS = [
        ("Despesa com Pessoal Poder Executivo (%)", "pessoal", 60.0, 57.0, 54.0),
        ("Despesa Empenhada Ensino (%)", "educacao", 25.0, None, None),
        ("Despesa Empenhada Saúde (%)", "saude", 15.0, None, None),
        ("Despesa Empenhada FUNDEB (%)", "fundeb", 100.0, None, None),
        ("Despesa Empenhada FUNDEB Profissionais da Educação (%)", "fundeb_profissionais", 70.0, None, None),
        ("Resultado da Execução Orçamentária (%)", "resultado_execucao", None, None, None),
    ]

    for r in reader:
        try:
            ano = int(r.get("Exercício") or 0)
            cod = int(r.get("Código IBGE") or 0)
        except (ValueError, TypeError):
            continue
        if not ano or not cod:
            continue

        for csv_col, indicador, limite, prud, alerta in MAPS:
            raw = r.get(csv_col)
            valor_decimal = _br_decimal(raw)
            if valor_decimal is None:
                continue
            # Convert decimal (0.5318) para percentual (53.18)
            valor_pct = valor_decimal * 100.0
            pct_lim = None
            if limite is not None and limite > 0:
                pct_lim = round((valor_pct / limite) * 100.0, 2)
            rows.append((
                cod, ano, 0, "A", indicador,
                round(valor_pct, 4), None, limite, pct_lim, "Audesp",
                prud, alerta,
            ))

    return rows


# --------------------------------------------------------------------
# Upserts
# --------------------------------------------------------------------

def faixa_pop(pop):
    if not pop:
        return None
    if pop <= 5_000: return "ate_5k"
    if pop <= 20_000: return "5k_20k"
    if pop <= 50_000: return "20k_50k"
    if pop <= 100_000: return "50k_100k"
    if pop <= 500_000: return "100k_500k"
    return "acima_500k"


def upsert_municipios(conn, municipios):
    # CRÍTICO: grava `uf` vinda do /entes do SICONFI. Sem isso, municípios de
    # outros estados cairiam no DEFAULT 'SP' e contaminariam vw_municipios_
    # publicados (ready) → alertas falsos sobre SP. Vide 0008_nacional_uf_gate.
    rows = [
        (m["cod_ibge"], m.get("ente"), m.get("populacao"),
         faixa_pop(m.get("populacao")), (m.get("uf") or "SP").upper())
        for m in municipios
    ]
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, """
            INSERT INTO municipios (cod_ibge, nome, populacao, faixa_pop, uf)
            VALUES %s
            ON CONFLICT (cod_ibge) DO UPDATE SET
              nome = EXCLUDED.nome,
              populacao = EXCLUDED.populacao,
              faixa_pop = EXCLUDED.faixa_pop,
              uf = EXCLUDED.uf,
              updated_at = NOW()
        """, rows, page_size=200)
    ufs = sorted({(m.get("uf") or "SP").upper() for m in municipios})
    log(f"  municipios: upserted {len(rows)} (UFs: {','.join(ufs)})")


def upsert_publicacao_status(conn, status_maps):
    rows = []
    for dataset, sm in status_maps.items():
        for cod, status in sm.items():
            rows.append((cod, dataset, status))
    if not rows:
        return
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, """
            INSERT INTO publicacao_status (cod_ibge, dataset, status)
            VALUES %s
            ON CONFLICT (cod_ibge, dataset) DO UPDATE SET
              status = EXCLUDED.status,
              atualizado_em = NOW()
        """, rows, page_size=500)
    log(f"  publicacao_status: upserted {len(rows)}")


def upsert_indicadores_lrf(conn, rows):
    """rows: [(cod_ibge, exercicio, periodo, periodicidade, indicador,
              valor, base_calculo, limite_legal, pct_do_limite, fonte,
              limite_prudencial, limite_alerta), ...]"""
    if not rows:
        return
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, """
            INSERT INTO indicadores_lrf (
              cod_ibge, exercicio, periodo, periodicidade, indicador,
              valor, base_calculo, limite_legal, pct_do_limite, fonte,
              limite_prudencial, limite_alerta
            )
            VALUES %s
            ON CONFLICT (cod_ibge, exercicio, periodo, periodicidade, indicador) DO UPDATE SET
              valor = EXCLUDED.valor,
              base_calculo = EXCLUDED.base_calculo,
              limite_legal = EXCLUDED.limite_legal,
              pct_do_limite = EXCLUDED.pct_do_limite,
              fonte = EXCLUDED.fonte,
              limite_prudencial = EXCLUDED.limite_prudencial,
              limite_alerta = EXCLUDED.limite_alerta,
              atualizado_em = NOW()
        """, rows, page_size=500)
    log(f"  indicadores_lrf: upserted {len(rows)}")


# --------------------------------------------------------------------
# Pipeline principal
# --------------------------------------------------------------------

# Tetos fiscais lidos do RGF (LRF / Res. SF 40 e 43). Faixas (prudencial/alerta)
# só existem onde a lei prevê: divida tem alerta=108 (prudencial não); os demais
# tetos não têm faixas intermediárias → None. Espelha lrf_indicador_meta (0009).
RGF_LRF_META = {
    # indicador               : (limite_legal, prudencial, alerta)
    "divida":                  (120.0, None, 108.0),
    "operacoes_credito":       (16.0,  None, None),
    "comprometimento_credito": (11.5,  None, None),
    "aro":                     (7.0,   None, None),
    "garantias":               (22.0,  None, None),
}


def _rgf_files():
    """Itera (ano, quadrimestre, filename) dos RGF disponíveis, do mais recente
    pro mais antigo. Mantém histórico (não dá break por ano: RGF é quadrimestral
    e queremos todas as leituras disponíveis, como já fazem RREO/Audesp)."""
    for ano in (2026, 2025, 2024):
        for q in (3, 2, 1):
            fname = f"rgf_{ano}_q{q}.json"
            if os.path.exists(os.path.join(SICONFI_DIR, fname)):
                yield ano, q, fname


def _lrf_row(cod, ano, periodo, indicador, valor_pct):
    """Monta a tupla de 12 campos pra indicadores_lrf a partir de um % sobre RCL."""
    limite, prud, alerta = RGF_LRF_META[indicador]
    pct_lim = None
    if limite and limite > 0:
        pct_lim = round((valor_pct / limite) * 100.0, 2)
    return (
        cod, ano, periodo, "Q", indicador,
        round(valor_pct, 4), None, limite, pct_lim, "RGF",
        prud, alerta,
    )


def build_lrf_rgf_rows():
    """Tetos fiscais do RGF (SICONFI): dívida (Anexo 02), operações de crédito +
    comprometimento + ARO (Anexo 04) e garantias (Anexo 03). Todos como % sobre a
    RCL. SP-only: o sync só carrega arquivos rgf_*.json gerados pra SP; o gate
    nacional (vw_municipios_publicados) garante a publicação só de SP de qualquer
    forma. NÃO altera o backfill nacional."""
    rows = []
    for ano, q, fname in _rgf_files():
        divida = extract_divida(fname, q)
        for cod, v in divida.items():
            rows.append(_lrf_row(cod, ano, q, "divida", v))

        garantias = extract_garantias(fname, q)
        for cod, v in garantias.items():
            rows.append(_lrf_row(cod, ano, q, "garantias", v))

        oac = extract_operacoes_e_aro(fname, q)
        for cod, fields in oac.items():
            for indicador in ("operacoes_credito", "comprometimento_credito", "aro"):
                if indicador in fields:
                    rows.append(_lrf_row(cod, ano, q, indicador, fields[indicador]))

        log(f"  RGF {ano}/Q{q}: divida={len(divida)} garantias={len(garantias)} "
            f"op_credito/aro={len(oac)}")
    return rows


def build_lrf_rows():
    """Constrói indicadores_lrf — Audesp Análises (TCE-SP) p/ pessoal/educação/
    saúde/FUNDEB/resultado + RGF (SICONFI) p/ os tetos de dívida, operações de
    crédito, comprometimento, ARO e garantias. Tudo SP-only."""
    rows = load_audesp_analises_rows()
    log(f"  Audesp Análises: {len(rows)} pontos de indicador "
        f"(~{len(rows)//6} munis × ano × 6 indicadores)")
    rgf_rows = build_lrf_rgf_rows()
    log(f"  RGF (tetos fiscais): {len(rgf_rows)} pontos de indicador")
    rows.extend(rgf_rows)
    return rows


# --------------------------------------------------------------------
# Áreas-fim / Despesas por Função (RREO Anexo 02)
# --------------------------------------------------------------------

# Classificação funcional brasileira (Lei 4.320/64 + Portaria MOG 42/99):
# subset de funções de governo. Áreas-fim = serviço direto à população.
AREAS_FIM = {
    "Educação", "Saúde", "Assistência Social", "Cultura", "Urbanismo",
    "Habitação", "Saneamento", "Gestão Ambiental", "Desporto e Lazer",
    "Agricultura", "Segurança Pública", "Trabalho", "Transporte",
    "Direitos da Cidadania", "Ciência e Tecnologia", "Indústria",
    "Comércio e Serviços", "Comunicações", "Energia", "Defesa Nacional",
    "Organização Agrária", "Relações Exteriores",
}

AREAS_MEIO = {
    "Legislativa", "Judiciária", "Essencial à Justiça", "Administração",
    "Previdência Social", "Encargos Especiais", "Reserva de Contingência",
}

ALL_FUNCOES = AREAS_FIM | AREAS_MEIO

# Colunas que nos interessam no RREO Anexo 02
COLS_DESPESA = {
    "DOTAÇÃO INICIAL": "dotacao_inicial",
    "DOTAÇÃO ATUALIZADA (a)": "dotacao_atualizada",
    "DESPESAS EMPENHADAS ATÉ O BIMESTRE (b)": "empenhado",
    "DESPESAS LIQUIDADAS ATÉ O BIMESTRE (d)": "liquidado",
    "% (b/total b)": "pct_do_total",
}


def extract_despesa_por_funcao(rreo_file):
    """Retorna dict {(cod_ibge, funcao): {dotacao_inicial, ..., pct_do_total}}.

    IMPORTANTE: O RREO Anexo 02 traz cada função DUAS VEZES no mesmo arquivo:
      - cod_conta='RREO2TotalDespesas' = tabela (I) Exceto Intra-Orçamentárias
      - cod_conta='RREO2TotalDespesasIntra' = tabela (II) Intra-Orçamentárias
    O total real da função = (I) + (II).
    """
    sums = defaultdict(lambda: defaultdict(float))
    pcts = {}
    for r in iter_json_records(rreo_file):
        if r.get("anexo") != "RREO-Anexo 02":
            continue
        conta = (r.get("conta") or "").strip()
        coluna = r.get("coluna")
        if conta not in ALL_FUNCOES:
            continue
        cod = r["cod_ibge"]
        try:
            v = float(r["valor"])
        except (TypeError, ValueError):
            continue
        if coluna in {"DOTAÇÃO INICIAL", "DOTAÇÃO ATUALIZADA (a)",
                      "DESPESAS EMPENHADAS ATÉ O BIMESTRE (b)",
                      "DESPESAS LIQUIDADAS ATÉ O BIMESTRE (d)"}:
            field = COLS_DESPESA[coluna]
            sums[(cod, conta)][field] += v
        elif coluna == "% (b/total b)":
            pcts[(cod, conta)] = v

    out = defaultdict(dict)
    for key, fields in sums.items():
        out[key].update(fields)
    for key, pct in pcts.items():
        out[key]["pct_do_total"] = pct
    return out


# Subfunções — RREO Anexo 02 traz contas começando com "FU<NN> -"
# Não dá pra mapear FU<NN> → função direto (precisa inferir pelo contexto).
# Mais simples: pegar contas que NÃO são função principal nem totalizador,
# e usar heurística pelo NOME (educação_subfunções = Ed Infantil, Ens Fund, etc.)
SUBFUNCAO_TO_FUNCAO = {
    # Educação
    "Educação Básica": "Educação", "Educação Infantil": "Educação",
    "Ensino Fundamental": "Educação", "Ensino Médio": "Educação",
    "Ensino Profissional": "Educação", "Ensino Superior": "Educação",
    "Educação de Jovens e Adultos": "Educação", "Educação Especial": "Educação",
    # Saúde
    "Atenção Básica": "Saúde", "Assistência Hospitalar e Ambulatorial": "Saúde",
    "Vigilância Sanitária": "Saúde", "Vigilância Epidemiológica": "Saúde",
    "Suporte Profilático e Terapêutico": "Saúde", "Alimentação e Nutrição": "Saúde",
    # Assistência Social
    "Assistência ao Idoso": "Assistência Social",
    "Assistência à Criança e ao Adolescente": "Assistência Social",
    "Assistência Comunitária": "Assistência Social",
    "Assistência à Pessoa com Deficiência": "Assistência Social",
    "Assistência aos Povos Indígenas": "Assistência Social",
    # Urbanismo
    "Infra-Estrutura Urbana": "Urbanismo", "Serviços Urbanos": "Urbanismo",
    "Ordenamento Territorial": "Urbanismo",
    # Habitação
    "Habitação Urbana": "Habitação", "Habitação Rural": "Habitação",
    # Saneamento
    "Saneamento Básico Urbano": "Saneamento", "Saneamento Básico Rural": "Saneamento",
    # Gestão Ambiental
    "Preservação e Conservação Ambiental": "Gestão Ambiental",
    "Controle Ambiental": "Gestão Ambiental",
    "Recuperação de Áreas Degradadas": "Gestão Ambiental",
    "Recursos Hídricos": "Gestão Ambiental",
    # Cultura
    "Difusão Cultural": "Cultura",
    "Patrimônio Histórico Artístico e Arqueológico": "Cultura",
    # Desporto e Lazer
    "Desporto Comunitário": "Desporto e Lazer",
    "Desporto de Rendimento": "Desporto e Lazer", "Lazer": "Desporto e Lazer",
    # Segurança Pública
    "Policiamento": "Segurança Pública", "Defesa Civil": "Segurança Pública",
    "Informação e Inteligência": "Segurança Pública",
    # Transporte
    "Transporte Rodoviário": "Transporte", "Transporte Aéreo": "Transporte",
    "Transporte Aquaviário": "Transporte",
    "Transportes Coletivos Urbanos": "Transporte",
    "Transportes Especiais": "Transporte",
    # Agricultura
    "Promoção da Produção Agropecuária": "Agricultura",
    "Defesa Agropecuária": "Agricultura", "Extensão Rural": "Agricultura",
    "Abastecimento": "Agricultura",
    # Trabalho
    "Empregabilidade": "Trabalho", "Fomento ao Trabalho": "Trabalho",
    "Proteção e Benefícios ao Trabalhador": "Trabalho",
    "Relações de Trabalho": "Trabalho",
    # Comércio e Serviços
    "Turismo": "Comércio e Serviços", "Promoção Comercial": "Comércio e Serviços",
    "Comercialização": "Comércio e Serviços",
    # Ciência e Tec
    "Desenvolvimento Científico": "Ciência e Tecnologia",
    "Desenvolvimento Tecnológico e Engenharia": "Ciência e Tecnologia",
    "Difusão do Conhecimento Científico e Tecnológico": "Ciência e Tecnologia",
    # Indústria
    "Promoção Industrial": "Indústria", "Produção Industrial": "Indústria",
    "Normalização e Qualidade": "Indústria", "Propriedade Industrial": "Indústria",
    "Normatização e Fiscalização": "Indústria",
    # Direitos da Cidadania
    "Direitos Individuais Coletivos e Difusos": "Direitos da Cidadania",
    # Comunicações
    "Telecomunicações": "Comunicações", "Comunicação Social": "Comunicações",
    "Comunicações Postais": "Comunicações",
    # Energia
    "Energia Elétrica": "Energia", "Conservação de Energia": "Energia",
    # Defesa
    "Defesa Terrestre": "Defesa Nacional",
}


def extract_subfuncoes(rreo_file):
    """Extrai subfunções com funcao_pai inferido pela tabela SUBFUNCAO_TO_FUNCAO."""
    sums = defaultdict(lambda: defaultdict(float))
    pcts = {}
    for r in iter_json_records(rreo_file):
        if r.get("anexo") != "RREO-Anexo 02":
            continue
        conta = (r.get("conta") or "").strip()
        if conta not in SUBFUNCAO_TO_FUNCAO:
            continue
        coluna = r.get("coluna")
        cod = r["cod_ibge"]
        try:
            v = float(r["valor"])
        except (TypeError, ValueError):
            continue
        funcao_pai = SUBFUNCAO_TO_FUNCAO[conta]
        if coluna in {"DOTAÇÃO INICIAL", "DOTAÇÃO ATUALIZADA (a)",
                      "DESPESAS EMPENHADAS ATÉ O BIMESTRE (b)",
                      "DESPESAS LIQUIDADAS ATÉ O BIMESTRE (d)"}:
            field = COLS_DESPESA[coluna]
            sums[(cod, conta, funcao_pai)][field] += v
        elif coluna == "% (b/total b)":
            pcts[(cod, conta, funcao_pai)] = v

    out = defaultdict(dict)
    for key, fields in sums.items():
        out[key].update(fields)
    for key, pct in pcts.items():
        out[key]["pct_do_total"] = pct
    return out


def build_subfuncoes_rows():
    """Subfunções por município, último bimestre disponível por ano."""
    rows = []
    for ano in (2024, 2025, 2026):
        for bim in (6, 5, 4, 3, 2, 1):
            fname = f"rreo_{ano}_bim{bim}.json"
            if not os.path.exists(os.path.join(SICONFI_DIR, fname)):
                continue
            data = extract_subfuncoes(fname)
            log(f"  Subfunções {ano}/B{bim}: {len(data)} (município, subfunção) pares")
            for (cod, subfuncao, funcao_pai), fields in data.items():
                rows.append((
                    cod, ano, bim, subfuncao,
                    True,                    # eh_subfuncao
                    False,                   # eh_area_fim (subfunção não é fim direto)
                    funcao_pai,
                    fields.get("dotacao_inicial"),
                    fields.get("dotacao_atualizada"),
                    fields.get("empenhado"),
                    fields.get("liquidado"),
                    fields.get("pct_do_total"),
                ))
            break
    return rows


# ---------- RCL e Resultado Primário (RREO Anexo 03 e 06) ----------

def extract_rcl(rreo_file):
    """RREO Anexo 03 → RCL total (12 meses) por município."""
    out = {}
    for r in iter_json_records(rreo_file):
        if r.get("anexo") != "RREO-Anexo 03":
            continue
        if r.get("cod_conta") != "RREO3ReceitaCorrenteLiquida":
            continue
        if r.get("coluna") != "TOTAL (ÚLTIMOS 12 MESES)":
            continue
        try:
            out[r["cod_ibge"]] = float(r["valor"])
        except (TypeError, ValueError):
            continue
    return out


def extract_resultado_primario(rreo_file):
    """RREO Anexo 06 → Resultado Primário (sem RPPS) + Meta da LDO.
    Usa cod_conta (estável) em vez de match por nome.
    """
    out = defaultdict(dict)
    for r in iter_json_records(rreo_file):
        if r.get("anexo") != "RREO-Anexo 06":
            continue
        codc = r.get("cod_conta")
        try:
            v = float(r["valor"])
        except (TypeError, ValueError):
            continue
        cod = r["cod_ibge"]
        if codc == "ResultadoPrimarioSemRPPSAcimaDaLinha":
            out[cod]["realizado"] = v
        elif codc == "MetaDeResultadoPrimarioFixadaNoAnexoDeMetasFiscaisDaLDOParaOExercicioDeReferencia":
            out[cod]["meta"] = v
        elif codc == "ResultadoNominalAbaixoDaLinhaSemRPPS":
            out[cod]["resultado_nominal"] = v
    return dict(out)


def build_fiscais_rows():
    """Indicadores fiscais agregados (RCL + Resultado Primário) por município."""
    rows = []
    for ano in (2024, 2025, 2026):
        for bim in (6, 5, 4, 3, 2, 1):
            fname = f"rreo_{ano}_bim{bim}.json"
            if not os.path.exists(os.path.join(SICONFI_DIR, fname)):
                continue
            # RCL
            rcl = extract_rcl(fname)
            log(f"  RCL {ano}/B{bim}: {len(rcl)} municípios")
            for cod, v in rcl.items():
                rows.append((cod, ano, bim, "B", "rcl", v, None, "RREO_03"))
            # Resultado Primário
            rp = extract_resultado_primario(fname)
            log(f"  Resultado Primário {ano}/B{bim}: {len(rp)} municípios")
            for cod, fields in rp.items():
                if "realizado" in fields:
                    rows.append((cod, ano, bim, "B", "resultado_primario",
                                fields["realizado"], fields.get("meta"), "RREO_06"))
                if "resultado_nominal" in fields:
                    rows.append((cod, ano, bim, "B", "resultado_nominal",
                                fields["resultado_nominal"], None, "RREO_06"))
            break  # só último bim disponível por ano
    return rows


def upsert_fiscais(conn, rows):
    if not rows:
        return
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, """
            INSERT INTO indicadores_fiscais (
              cod_ibge, exercicio, periodo, periodicidade, indicador, valor, meta, fonte
            )
            VALUES %s
            ON CONFLICT (cod_ibge, exercicio, periodo, periodicidade, indicador) DO UPDATE SET
              valor = EXCLUDED.valor, meta = EXCLUDED.meta, fonte = EXCLUDED.fonte,
              atualizado_em = NOW()
        """, rows, page_size=500)
    log(f"  indicadores_fiscais: upserted {len(rows)}")


def build_despesa_por_funcao_rows():
    """Itera todos os arquivos RREO disponíveis e gera linhas pra UPSERT.
    Pega o ÚLTIMO bimestre disponível por (município, ano) — mais atualizado."""
    rows = []
    # Para cada ano, pega bimestre mais recente disponível por município
    for ano in (2024, 2025, 2026):
        # Encontrar bimestre mais alto que tem arquivo
        for bim in (6, 5, 4, 3, 2, 1):
            fname = f"rreo_{ano}_bim{bim}.json"
            if not os.path.exists(os.path.join(SICONFI_DIR, fname)):
                continue
            data = extract_despesa_por_funcao(fname)
            log(f"  RREO {ano}/B{bim}: {len(data)} (município, função) pares")
            for (cod, funcao), fields in data.items():
                eh_area_fim = funcao in AREAS_FIM
                rows.append((
                    cod, ano, bim, funcao,
                    False,                   # eh_subfuncao (só funções principais por enquanto)
                    eh_area_fim,
                    None,                    # funcao_pai
                    fields.get("dotacao_inicial"),
                    fields.get("dotacao_atualizada"),
                    fields.get("empenhado"),
                    fields.get("liquidado"),
                    fields.get("pct_do_total"),
                ))
            break  # só pega o bimestre mais alto disponível por ano
    return rows


def upsert_despesa_por_funcao(conn, rows):
    if not rows:
        return
    # Normalizar funcao_pai NULL → '' (constraint NOT NULL na PK)
    rows = [
        (r[0], r[1], r[2], r[3], r[4], r[5], r[6] or '',
         r[7], r[8], r[9], r[10], r[11])
        for r in rows
    ]
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, """
            INSERT INTO despesa_por_funcao (
              cod_ibge, exercicio, periodo, funcao,
              eh_subfuncao, eh_area_fim, funcao_pai,
              dotacao_inicial, dotacao_atualizada, empenhado, liquidado, pct_do_total
            )
            VALUES %s
            ON CONFLICT (cod_ibge, exercicio, periodo, funcao, funcao_pai) DO UPDATE SET
              eh_subfuncao = EXCLUDED.eh_subfuncao,
              eh_area_fim = EXCLUDED.eh_area_fim,
              dotacao_inicial = EXCLUDED.dotacao_inicial,
              dotacao_atualizada = EXCLUDED.dotacao_atualizada,
              empenhado = EXCLUDED.empenhado,
              liquidado = EXCLUDED.liquidado,
              pct_do_total = EXCLUDED.pct_do_total,
              atualizado_em = NOW()
        """, rows, page_size=500)
    log(f"  despesa_por_funcao: upserted {len(rows)}")


def main():
    start = datetime.now()
    log("=" * 60)
    log("SICONFI/Audesp → Neon sync")
    log("=" * 60)

    log("Conectando ao Neon...")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False

    try:
        log("Carregando municipios...")
        municipios = load_municipios()
        log(f"  {len(municipios)} municípios SP")

        log("Carregando status maps...")
        status_maps = load_status_maps()
        log(f"  {len(status_maps)} datasets com status")

        log("Upserting municipios...")
        upsert_municipios(conn, municipios)

        log("Upserting publicacao_status...")
        upsert_publicacao_status(conn, status_maps)

        log("Construindo indicadores LRF a partir de RREO/RGF...")
        lrf_rows = build_lrf_rows()
        log(f"  Total: {len(lrf_rows)} pontos de indicador a inserir")

        log("Upserting indicadores_lrf...")
        upsert_indicadores_lrf(conn, lrf_rows)

        log("Extraindo despesas por função (RREO Anexo 02)...")
        funcao_rows = build_despesa_por_funcao_rows()
        log(f"  Total: {len(funcao_rows)} linhas (função × município × ano)")

        log("Upserting despesa_por_funcao...")
        upsert_despesa_por_funcao(conn, funcao_rows)

        log("Extraindo subfunções (RREO Anexo 02)...")
        subf_rows = build_subfuncoes_rows()
        log(f"  Total: {len(subf_rows)} linhas")
        upsert_despesa_por_funcao(conn, subf_rows)

        log("Extraindo indicadores fiscais (RCL + Resultado Primário)...")
        fis_rows = build_fiscais_rows()
        log(f"  Total: {len(fis_rows)} linhas")
        upsert_fiscais(conn, fis_rows)

        conn.commit()
        log(f"Commit OK em {datetime.now() - start}")
    except Exception as e:
        conn.rollback()
        log(f"FALHA: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
