#!/usr/bin/env python3
"""
SIOPS → Neon DB sync
====================
Lê os JSONs gerados por `pipeline/siops_scraper.py` (em `siops_data/`) e faz
UPSERT em `indicadores_saude` no Neon. Idempotente.

Mapeamento:
  indicadores_saude.cod_ibge      = JSON.cod_ibge
  indicadores_saude.exercicio     = JSON.ano
  indicadores_saude.periodo       = JSON.bimestre (1..6)
  indicadores_saude.indicador     = INDICADORES_MAP[code][0]
  indicadores_saude.valor         = valor_float
  indicadores_saude.limite_legal  = INDICADORES_MAP[code][2]   (só 'asps_pct' = 15.0)
  indicadores_saude.fonte_id      = 'SIOPS'
  indicadores_saude.fonte_detalhe = 'SIOPS_codigo:<x.y>'        (parte da PK)

Uso:
  DATABASE_URL=postgresql://... python3 sync_siops.py [--ano N] [--limit N]
"""

import argparse
import json
import os
import sys
from datetime import datetime

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERRO: psycopg2 não instalado. Rode: python3 -m pip install --user psycopg2-binary")
    sys.exit(1)

BASE = os.path.dirname(os.path.abspath(__file__))
SIOPS_DIR = os.path.join(BASE, "siops_data")

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
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


def load_indicadores_map():
    path = os.path.join(SIOPS_DIR, "indicadores_map.json")
    if not os.path.exists(path):
        log("ERRO: indicadores_map.json não existe. Rode siops_scraper.py primeiro.")
        sys.exit(1)
    with open(path) as f:
        return json.load(f)


def iter_siops_files(ano_filter=None):
    """Itera arquivos siops_<ano>_bim<n>.json em ordem."""
    for fname in sorted(os.listdir(SIOPS_DIR)):
        if not fname.startswith("siops_") or not fname.endswith(".json"):
            continue
        if ".status." in fname:
            continue
        # parse: siops_2024_bim6.json
        parts = fname.replace(".json", "").split("_")
        if len(parts) != 3:
            continue
        try:
            ano = int(parts[1])
            bim = int(parts[2].replace("bim", ""))
        except ValueError:
            continue
        if ano_filter and ano != ano_filter:
            continue
        yield os.path.join(SIOPS_DIR, fname), ano, bim


def build_rows(ano_filter=None):
    """Constrói lista de tuplas para UPSERT em indicadores_saude.
    Tupla: (cod_ibge, exercicio, periodo, indicador, valor, base_calculo,
            limite_legal, fonte_id, fonte_detalhe)."""
    ind_map = load_indicadores_map()
    rows = []
    files_seen = 0
    for path, ano, bim in iter_siops_files(ano_filter):
        files_seen += 1
        with open(path) as f:
            items = json.load(f)
        for it in items:
            cod = it["cod_ibge"]
            for codigo_siops, valor in (it.get("indicadores") or {}).items():
                meta = ind_map.get(codigo_siops)
                if not meta:
                    continue
                ident = meta["id"]
                limite = meta.get("limite_legal")
                rows.append((
                    cod,
                    ano,
                    bim,
                    ident,
                    valor,
                    None,                           # base_calculo (não temos no SIOPS direto)
                    limite,
                    "SIOPS",
                    f"SIOPS_codigo:{codigo_siops}",
                ))
        log(f"  {os.path.basename(path)}: {len(items)} munis → {len(items) * 14} pontos")
    log(f"  Arquivos lidos: {files_seen} | total rows: {len(rows)}")
    return rows


def upsert_saude(conn, rows):
    if not rows:
        log("  Nada para upsertar.")
        return
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, """
            INSERT INTO indicadores_saude (
              cod_ibge, exercicio, periodo, indicador,
              valor, base_calculo, limite_legal, fonte_id, fonte_detalhe
            )
            VALUES %s
            ON CONFLICT (cod_ibge, exercicio, periodo, indicador, fonte_detalhe) DO UPDATE SET
              valor = EXCLUDED.valor,
              base_calculo = EXCLUDED.base_calculo,
              limite_legal = EXCLUDED.limite_legal,
              fonte_id = EXCLUDED.fonte_id,
              atualizado_em = NOW()
        """, rows, page_size=500)
    log(f"  indicadores_saude: upserted {len(rows)} linhas")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ano", type=int, default=None,
                    help="Restringir UPSERT a 1 ano (default: todos disponíveis)")
    ap.add_argument("--dry-run", action="store_true",
                    help="Apenas mostra quantas linhas seriam inseridas, sem commit")
    args = ap.parse_args()

    start = datetime.now()
    log("=" * 60)
    log("SIOPS → Neon sync")
    log("=" * 60)

    log("Construindo rows a partir dos JSONs...")
    rows = build_rows(ano_filter=args.ano)
    if not rows:
        log("Nenhum dado encontrado. Saindo.")
        return

    if args.dry_run:
        log("DRY-RUN: não conectando ao Neon.")
        # Sample primeira e última linha
        log(f"  primeira row: {rows[0]}")
        log(f"  última row:   {rows[-1]}")
        return

    log("Conectando ao Neon...")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    try:
        upsert_saude(conn, rows)
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
