#!/usr/bin/env python3
"""
SIOPE → Neon DB sync
====================
Lê os arquivos JSON produzidos por `siope_scraper.py` e faz UPSERT em
`indicadores_educacao` no Neon (banco do projeto ldo-dados-sp).
Idempotente.

Não toca em `sync_to_neon.py` — esse script é independente e roda em paralelo
ou em sequência.

Uso:
  export DATABASE_URL="postgresql://..."     # ou define em .env.local
  python3 sync_siope.py

Tabela alvo (migrations/0004_radar_360.sql):
  indicadores_educacao(
    cod_ibge BIGINT,
    exercicio INTEGER,
    periodo INTEGER,         -- 0 = consolidado anual SIOPE; 6 = ANUAL FUNDEB
    indicador TEXT,
    valor NUMERIC,
    base_calculo NUMERIC,
    limite_legal NUMERIC,
    fonte_id TEXT,
    fonte_detalhe TEXT,
    PRIMARY KEY (cod_ibge, exercicio, periodo, indicador, fonte_detalhe)
  )

Indicadores SIOPE mapeados pra `indicadores_educacao`:
  fundeb_remuneracao_pct        (limite_legal = 70.0, semântica MIN)
  fundeb_vaat_ed_infantil_pct
  fundeb_vaat_capital_pct       (15.0, MIN)
  fundeb_nao_aplicado_pct       (10.0, MAX)
  fundeb_receita_total          (valor absoluto, sem limite)
  fundeb_despesa_total
  fundeb_remuneracao_valor
  fundeb_disponibilidade_31dez_ano_anterior
  fundeb_saldo_conciliado
"""

from __future__ import annotations

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


PIPELINE_DIR = os.path.dirname(os.path.abspath(__file__))
SIOPE_DIR = os.path.join(PIPELINE_DIR, "siope_data")

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


FONTE_ID = "SIOPE"
FONTE_DETALHE = "SIOPE Demonstrativo FUNDEB (Anual)"


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def iter_records():
    """Itera todos os arquivos fundeb_*.json em siope_data/."""
    if not os.path.isdir(SIOPE_DIR):
        log(f"  AVISO: {SIOPE_DIR} não existe — rode siope_scraper.py primeiro")
        return
    for fn in sorted(os.listdir(SIOPE_DIR)):
        if not (fn.startswith("fundeb_") and fn.endswith(".json")) or fn.endswith(".status.json"):
            continue
        with open(os.path.join(SIOPE_DIR, fn), encoding="utf-8") as f:
            for rec in json.load(f):
                yield rec


def build_rows() -> list[tuple]:
    """Achata records em linhas (cod_ibge, exercicio, periodo, indicador, ...)."""
    rows = []
    for rec in iter_records():
        cod = rec["cod_ibge"]
        ano = rec["exercicio"]
        periodo = rec.get("periodo", 6)  # 6 = anual
        for indicador, payload in rec["indicadores"].items():
            valor = payload.get("valor")
            limite = payload.get("limite_legal")
            if valor is None:
                continue
            rows.append((
                cod, ano, periodo, indicador,
                valor,
                None,           # base_calculo — SIOPE não expõe diretamente
                limite,
                FONTE_ID,
                FONTE_DETALHE,
            ))
    return rows


def upsert(conn, rows: list[tuple]) -> None:
    if not rows:
        log("  Nada a upsertar.")
        return
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, """
            INSERT INTO indicadores_educacao (
                cod_ibge, exercicio, periodo, indicador,
                valor, base_calculo, limite_legal,
                fonte_id, fonte_detalhe
            )
            VALUES %s
            ON CONFLICT (cod_ibge, exercicio, periodo, indicador, fonte_detalhe) DO UPDATE SET
                valor = EXCLUDED.valor,
                base_calculo = EXCLUDED.base_calculo,
                limite_legal = EXCLUDED.limite_legal,
                fonte_id = EXCLUDED.fonte_id,
                atualizado_em = NOW()
        """, rows, page_size=500)
    log(f"  indicadores_educacao: upserted {len(rows)} linhas")


def ensure_fonte(conn) -> None:
    """Garante que fontes/id='SIOPE' exista (idempotente)."""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO fontes (id, operador, url_base, tipo_acesso, cobertura, observacoes)
            VALUES ('SIOPE', 'FNDE', 'https://www.fnde.gov.br/siope/',
                    'SCRAPE_HTML', 'BR todo',
                    'Indicadores FUNDEB anuais via demonstrativoFundefMunicipal.do (PDF)')
            ON CONFLICT (id) DO NOTHING
        """)


def main() -> None:
    start = datetime.now()
    log("=" * 60)
    log("SIOPE → Neon sync")
    log("=" * 60)

    log("Conectando ao Neon...")
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False

    try:
        ensure_fonte(conn)
        log("Construindo linhas a partir de siope_data/*.json...")
        rows = build_rows()
        log(f"  Total: {len(rows)} pontos de indicador")

        log("Upserting...")
        upsert(conn, rows)

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
