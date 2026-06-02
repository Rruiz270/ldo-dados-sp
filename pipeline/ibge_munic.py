#!/usr/bin/env python3
"""
IBGE MUNIC → Neon DB (indicadores institucionais dos 645 municípios de SP)
==========================================================================
Ingere a Pesquisa de Informações Básicas Municipais (MUNIC/IBGE) via API v3
(agregados/SIDRA) e faz UPSERT idempotente em `indicadores_externos` com
fonte 'IBGE-MUNIC'. SP-only: usa localidades=N6[N3[35]] (N3[35]=SP desce ao
nível municipal N6), devolvendo todos os ~645 munis de SP por chamada.

Cada VARIÁVEL-ALVO mapeia um indicador institucional booleano (Sim/Não):
a MUNIC publica esses atributos como CONTAGENS por categoria, então a leitura
per-município é: a série vale "1" na categoria afirmativa quando o município
TEM o atributo, e "-"/ausente caso contrário. Normalizamos para:
    valor_texto    = 'Sim' | 'Não'
    valor_numerico = 1 | 0

Variáveis-alvo (institucionais, úteis p/ gestão municipal):
  plano_diretor                      Plano Diretor existente               (gestao)
  plano_municipal_educacao           Plano Municipal de Educação           (educacao)
  plano_municipal_saude              Plano Municipal de Saúde              (saude)
  conselho_municipal_educacao_ativo  Conselho Mun. de Educação ATIVO       (educacao)
  conselho_acompanhamento_fundeb     Conselho de Acomp. e Controle do FUNDEB (educacao)
  plano_carreira_magisterio          Plano de Carreira para o Magistério   (educacao)
  fundo_municipal_saude              Fundo Municipal de Saúde              (saude)

Destino: indicadores_externos (cod_ibge, fonte_id='IBGE-MUNIC', indicador,
categoria, periodo_referencia, valor_numerico, valor_texto, unidade, metadata).
PK lógica (cod_ibge, fonte_id, indicador, periodo_referencia) garante
idempotência: re-run faz UPDATE, nunca duplica.

Uso:
  DATABASE_URL=postgresql://... python3 ibge_munic.py [--ano N] [--dry-run]
                                                      [--only ind1,ind2] [--limit N]

  --ano      Ano de referência. Default: ano de cada variável (MUNIC tem
             edições por tema; ver INDICADORES). Passar --ano força o período
             em todas (só funciona se a edição existir na API).
  --dry-run  Busca da API e mostra prévia, sem tocar no banco.
  --only     Lista de indicadores (chaves acima), separados por vírgula.
  --limit    Limita nº de munis impressos no resumo.
"""

import argparse
import gzip
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERRO: psycopg2 não instalado. Rode: python3 -m pip install --user psycopg2-binary")
    sys.exit(1)

API_BASE = "https://servicodados.ibge.gov.br/api/v3/agregados"
SP_LOCALIDADES = "N6[N3[35]]"          # N3[35] = São Paulo; N6 desce ao municipal
FONTE_ID = "IBGE-MUNIC"

# ---------------------------------------------------------------------
# Catálogo de variáveis-alvo. Cada entrada descreve como ler 1 atributo
# institucional booleano da MUNIC na API v3. Os IDs de agregado/variável/
# classificação/categoria foram verificados contra a API (edição mais
# recente disponível por tema).
#
#   agregado   : id da tabela MUNIC (SIDRA)
#   ano        : período de referência (edição MUNIC)
#   variavel   : id da variável
#   classif    : id da classificação cuja categoria afirmativa indica "Sim"
#   cat_sim    : id da categoria afirmativa (série == "1" => município TEM)
#   categoria  : bucket em indicadores_externos.categoria
# ---------------------------------------------------------------------
INDICADORES = {
    "plano_diretor": {
        "label": "Possui Plano Diretor",
        "agregado": 5882, "ano": 2021, "variavel": 603,
        "classif": 1480, "cat_sim": 58279,        # 'Com Plano Diretor'
        "categoria": "gestao",
    },
    "plano_municipal_educacao": {
        "label": "Possui Plano Municipal de Educação",
        "agregado": 7308, "ano": 2021, "variavel": 603,
        "classif": 1329, "cat_sim": 58617,        # 'Com Plano Municipal de Educação'
        "categoria": "educacao",
    },
    "plano_municipal_saude": {
        "label": "Possui Plano Municipal de Saúde",
        "agregado": 7308, "ano": 2021, "variavel": 603,
        "classif": 1329, "cat_sim": 58623,        # 'Com Plano Municipal de Saúde'
        "categoria": "saude",
    },
    "conselho_municipal_educacao_ativo": {
        "label": "Conselho Municipal de Educação ativo",
        "agregado": 7341, "ano": 2021, "variavel": 12815,
        "classif": 1510, "cat_sim": 58783,        # 'Ativo'
        "categoria": "educacao",
    },
    "conselho_acompanhamento_fundeb": {
        "label": "Possui Conselho de Acompanhamento e Controle Social do FUNDEB",
        "agregado": 7393, "ano": 2021, "variavel": 12817,
        "classif": 12446, "cat_sim": 47692,       # 'Total' (variável já conta só quem possui)
        "categoria": "educacao",
    },
    "plano_carreira_magisterio": {
        "label": "Possui Plano de Carreira para o Magistério",
        "agregado": 7310, "ano": 2021, "variavel": 603,
        "classif": 1494, "cat_sim": 58630,        # 'Com plano'
        "categoria": "educacao",
    },
    "fundo_municipal_saude": {
        "label": "Possui Fundo Municipal de Saúde",
        "agregado": 9714, "ano": 2021, "variavel": 12850,
        "classif": 1577, "cat_sim": 59372,        # 'Total' (variável já conta só quem possui)
        "categoria": "saude",
    },
}

SP_UF_COD = "35"   # prefixo do cod_ibge dos municípios de SP


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def get_database_url():
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    here = os.path.dirname(os.path.abspath(__file__))
    for envpath in (
        os.path.join(here, "..", ".env.local"),
        "/Users/raphaelruiz/ldo-dados-sp/.env.local",
    ):
        if os.path.exists(envpath):
            with open(envpath) as f:
                for line in f:
                    if line.startswith("DATABASE_URL="):
                        return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def build_url(spec, ano):
    """Monta a URL da API v3 para uma variável-alvo, escapando os colchetes."""
    qs = {
        "localidades": SP_LOCALIDADES,
        "classificacao": f"{spec['classif']}[{spec['cat_sim']}]",
    }
    query = urllib.parse.urlencode(qs, safe="[]")
    # urlencode preserva [] via safe; a API aceita N6[N3[35]] e classif[cat].
    return (
        f"{API_BASE}/{spec['agregado']}/periodos/{ano}"
        f"/variaveis/{spec['variavel']}?{query}"
    )


def fetch(url, timeout=90):
    # Identity encoding evita resposta gzip; mesmo assim descomprimimos por garantia.
    req = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "Accept-Encoding": "identity",
        "User-Agent": "ldo-dados-sp/ibge-munic",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read()
        if resp.headers.get("Content-Encoding", "").lower() == "gzip" or body[:2] == b"\x1f\x8b":
            body = gzip.decompress(body)
    raw = body.decode("utf-8")
    data = json.loads(raw)
    if isinstance(data, dict) and data.get("statusCode"):
        raise RuntimeError(f"API erro {data.get('statusCode')}: {data.get('message')}")
    return data


def parse_series(api_json):
    """Devolve {cod_ibge(int): valor_str} para a categoria afirmativa.

    Cada resultado traz N municípios; a série tem 1 período → 1 valor.
    """
    out = {}
    for variavel in api_json:
        for res in variavel.get("resultados", []):
            for s in res.get("series", []):
                loc = s["localidade"]["id"]
                vals = list(s["serie"].values())
                val = vals[0] if vals else None
                out[loc] = val
    return out


def normalize(valor_str):
    """MUNIC: '1' na categoria afirmativa = Sim; '-' (ou ausente) = Não.
    '..' e 'X' = não aplicável/sem informação → trata como Não-informado (None)."""
    if valor_str is None:
        return None, None
    v = valor_str.strip()
    if v == "1":
        return "Sim", 1
    if v in ("-", "0"):
        return "Não", 0
    if v in ("..", "...", "X", ""):
        return None, None
    # Numérico inesperado: preserva como texto/num, sem quebrar.
    try:
        n = float(v)
        return ("Sim", 1) if n >= 1 else ("Não", 0)
    except ValueError:
        return v, None


def collect(only=None, ano_override=None):
    """Busca todas as variáveis-alvo e devolve rows prontas pra UPSERT.

    rows: (cod_ibge, fonte_id, indicador, categoria, periodo_referencia,
           valor_numerico, valor_texto, unidade, metadata_json)
    """
    rows = []
    resumo = {}
    keys = only if only else list(INDICADORES.keys())
    for ind in keys:
        spec = INDICADORES[ind]
        ano = ano_override or spec["ano"]
        url = build_url(spec, ano)
        log(f"GET {ind} (agregado {spec['agregado']}, ano {ano})")
        try:
            data = fetch(url)
        except Exception as e:
            log(f"  FALHA em {ind}: {e}")
            resumo[ind] = {"erro": str(e)}
            continue
        series = parse_series(data)
        sp = {cod: val for cod, val in series.items() if str(cod).startswith(SP_UF_COD)}
        periodo = f"{ano}-12-31"
        sim = nao = ni = 0
        for cod, raw in sp.items():
            vt, vn = normalize(raw)
            if vt == "Sim":
                sim += 1
            elif vt == "Não":
                nao += 1
            else:
                ni += 1
            meta = {
                "agregado": spec["agregado"],
                "variavel": spec["variavel"],
                "classificacao": spec["classif"],
                "categoria_sim": spec["cat_sim"],
                "label": spec["label"],
                "valor_bruto": raw,
                "pesquisa": "MUNIC",
            }
            rows.append((
                int(cod), FONTE_ID, ind, spec["categoria"], periodo,
                vn, vt, "bool", psycopg2.extras.Json(meta),
            ))
        resumo[ind] = {"munis": len(sp), "sim": sim, "nao": nao, "nao_informado": ni}
        log(f"  {ind}: {len(sp)} munis SP | Sim={sim} Não={nao} N/I={ni}")
    return rows, resumo


def upsert(conn, rows):
    if not rows:
        return
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, """
            INSERT INTO indicadores_externos (
              cod_ibge, fonte_id, indicador, categoria, periodo_referencia,
              valor_numerico, valor_texto, unidade, metadata
            )
            VALUES %s
            ON CONFLICT (cod_ibge, fonte_id, indicador, periodo_referencia) DO UPDATE SET
              categoria      = EXCLUDED.categoria,
              valor_numerico = EXCLUDED.valor_numerico,
              valor_texto    = EXCLUDED.valor_texto,
              unidade        = EXCLUDED.unidade,
              metadata       = EXCLUDED.metadata,
              atualizado_em  = NOW()
        """, rows, page_size=1000)
    conn.commit()
    log(f"indicadores_externos: upserted {len(rows)} linhas")


def main():
    ap = argparse.ArgumentParser(description="Ingestão IBGE MUNIC → indicadores_externos (SP)")
    ap.add_argument("--ano", type=int, default=None,
                    help="Força o período em todas as variáveis (default: ano por variável).")
    ap.add_argument("--only", type=str, default=None,
                    help="Indicadores específicos, separados por vírgula.")
    ap.add_argument("--dry-run", action="store_true", help="Não grava no banco.")
    ap.add_argument("--limit", type=int, default=5, help="Munis no resumo final.")
    args = ap.parse_args()

    only = [s.strip() for s in args.only.split(",")] if args.only else None
    if only:
        bad = [k for k in only if k not in INDICADORES]
        if bad:
            print(f"ERRO: indicadores desconhecidos: {bad}")
            print(f"Disponíveis: {list(INDICADORES.keys())}")
            sys.exit(2)

    rows, resumo = collect(only=only, ano_override=args.ano)
    log("Resumo: " + json.dumps(resumo, ensure_ascii=False))

    if not rows:
        log("Nenhuma linha coletada — encerrando.")
        sys.exit(1)

    if args.dry_run:
        log("DRY-RUN — não gravando. Amostra:")
        for r in rows[:args.limit]:
            print(f"  cod={r[0]} {r[2]}={r[6]} (num={r[5]}) per={r[4]}")
        return

    url = get_database_url()
    if not url:
        print("ERRO: DATABASE_URL não definido")
        sys.exit(1)
    conn = psycopg2.connect(url)
    try:
        upsert(conn, rows)
        with conn.cursor() as cur:
            cur.execute("""
                SELECT indicador, COUNT(DISTINCT cod_ibge), SUM(valor_numerico)
                FROM indicadores_externos
                WHERE fonte_id = %s
                GROUP BY indicador ORDER BY indicador
            """, (FONTE_ID,))
            log("Conferência no banco (indicador | munis distintos | soma Sim):")
            for ind, n, soma in cur.fetchall():
                print(f"  {ind}: {n} munis | {int(soma or 0)} Sim")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
