#!/usr/bin/env python3
"""
Regerar alertas — daily pipeline step
======================================
Chama regerar_alertas_munic(cod_ibge) pra cada um dos 645 municípios SP.
Roda no fim do run_daily.sh, depois que todos os sync_* terminaram (pra que
os alertas reflitam os indicadores mais recentes).

A função SQL é idempotente:
  - DELETE alertas WHERE status='aberto' AND fonte_engine IS NOT NULL
  - INSERT novos alertas com ON CONFLICT (cod_ibge, hash_dedup) DO NOTHING
Logo, rodar 2x no mesmo dia produz o mesmo estado.

Uso:
  python3 regenerar_alertas.py
"""

import os
import sys
from datetime import datetime
from typing import Optional

try:
    import psycopg2
except ImportError:
    print("ERRO: psycopg2 não instalado. pip install psycopg2-binary")
    sys.exit(1)


# --------------------------------------------------------------------
# DB connection (mesmo padrão de sync_to_neon.py)
# --------------------------------------------------------------------
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


# --------------------------------------------------------------------
# Estratégia: per-muni autocommit
# --------------------------------------------------------------------
# Cada município é uma transação independente. Falha em SP capital (3550308)
# não derruba os outros 644. Trade-off: ~645 round-trips no pooler.
def regenerar_todos(conn, limit: Optional[int] = None) -> dict:
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SELECT cod_ibge FROM municipios ORDER BY cod_ibge")
    cods = [r[0] for r in cur.fetchall()]
    if limit:
        cods = cods[:limit]

    ok = falha = inseridos = 0
    erros = []

    for i, cod in enumerate(cods, 1):
        try:
            cur.execute("SELECT regerar_alertas_munic(%s)", (cod,))
            inseridos += cur.fetchone()[0] or 0
            ok += 1
        except Exception as e:
            falha += 1
            erros.append((cod, str(e)[:200]))
        if i % 100 == 0:
            log(f"  progresso: {i}/{len(cods)} ok={ok} falha={falha} inseridos={inseridos}")

    return {"ok": ok, "falha": falha, "alertas_inseridos": inseridos, "erros": erros}


# --------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------
def main():
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])

    log("Conectando ao Neon...")
    conn = psycopg2.connect(DATABASE_URL)

    alvo = f"{limit} municípios (smoke)" if limit else "645 municípios SP"
    log(f"Regenerando alertas para {alvo}...")
    stats = regenerar_todos(conn, limit=limit)

    log(f"FIM regeneração — ok={stats['ok']} falhas={stats['falha']} "
        f"alertas_inseridos={stats['alertas_inseridos']}")
    if stats['erros']:
        log(f"Primeiros erros: {stats['erros'][:5]}")

    conn.close()
    sys.exit(0 if stats['falha'] == 0 else 1)


if __name__ == "__main__":
    main()
