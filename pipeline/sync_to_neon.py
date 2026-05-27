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
    path = os.path.join(SICONFI_DIR, "municipios_sp.json")
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


def extract_divida(rgf_file):
    """RGF Anexo 02 → DCL / RCL (limite 1.2)."""
    out = {}
    for r in iter_json_records(rgf_file):
        if r.get("anexo") != "RGF-Anexo 02":
            continue
        conta = (r.get("conta") or "").upper()
        coluna = (r.get("coluna") or "").upper()
        if "DIVIDA CONSOLIDADA LIQUIDA" in conta and "%" in coluna:
            out[r["cod_ibge"]] = float(r["valor"])
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

    # Mapeamento (nome_coluna_csv, indicador, limite_legal, semantica)
    # Semântica: "max" = limite máximo (alto=ruim, ex pessoal 60%)
    #            "min" = piso obrigatório (alto=bom, ex educação 25%)
    MAPS = [
        ("Despesa com Pessoal Poder Executivo (%)", "pessoal", 60.0, "max"),
        ("Despesa Empenhada Ensino (%)", "educacao", 25.0, "min"),
        ("Despesa Empenhada Saúde (%)", "saude", 15.0, "min"),
        ("Despesa Empenhada FUNDEB (%)", "fundeb", 100.0, "min"),
        ("Despesa Empenhada FUNDEB Profissionais da Educação (%)", "fundeb_profissionais", 70.0, "min"),
        ("Resultado da Execução Orçamentária (%)", "resultado_execucao", None, None),
    ]

    for r in reader:
        try:
            ano = int(r.get("Exercício") or 0)
            cod = int(r.get("Código IBGE") or 0)
        except (ValueError, TypeError):
            continue
        if not ano or not cod:
            continue

        for csv_col, indicador, limite, _semantica in MAPS:
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
                round(valor_pct, 4), None, limite, pct_lim, "Audesp"
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
    rows = [
        (m["cod_ibge"], m.get("ente"), m.get("populacao"), faixa_pop(m.get("populacao")))
        for m in municipios
    ]
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, """
            INSERT INTO municipios (cod_ibge, nome, populacao, faixa_pop)
            VALUES %s
            ON CONFLICT (cod_ibge) DO UPDATE SET
              nome = EXCLUDED.nome,
              populacao = EXCLUDED.populacao,
              faixa_pop = EXCLUDED.faixa_pop,
              updated_at = NOW()
        """, rows, page_size=200)
    log(f"  municipios: upserted {len(rows)}")


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
              valor, base_calculo, limite_legal, pct_do_limite, fonte), ...]"""
    if not rows:
        return
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, """
            INSERT INTO indicadores_lrf (
              cod_ibge, exercicio, periodo, periodicidade, indicador,
              valor, base_calculo, limite_legal, pct_do_limite, fonte
            )
            VALUES %s
            ON CONFLICT (cod_ibge, exercicio, periodo, periodicidade, indicador) DO UPDATE SET
              valor = EXCLUDED.valor,
              base_calculo = EXCLUDED.base_calculo,
              limite_legal = EXCLUDED.limite_legal,
              pct_do_limite = EXCLUDED.pct_do_limite,
              fonte = EXCLUDED.fonte,
              atualizado_em = NOW()
        """, rows, page_size=500)
    log(f"  indicadores_lrf: upserted {len(rows)}")


# --------------------------------------------------------------------
# Pipeline principal
# --------------------------------------------------------------------

def build_lrf_rows():
    """Constrói indicadores_lrf — V1 usa Audesp Análises (TCE-SP processado).
    Em V2 vamos cruzar com RGF/RREO raw pra drill-down e dados mais frescos."""
    rows = load_audesp_analises_rows()
    log(f"  Audesp Análises: {len(rows)} pontos de indicador "
        f"(~{len(rows)//6} munis × ano × 6 indicadores)")
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
