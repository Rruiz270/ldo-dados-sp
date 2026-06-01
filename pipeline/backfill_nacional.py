#!/usr/bin/env python3
"""
Backfill nacional — orquestrador estado-a-estado
=================================================
Puxa a base fiscal (SICONFI, API REST oficial do Tesouro) dos 5.570 municípios
do Brasil, UM ESTADO POR VEZ, sem nunca tocar São Paulo (já em produção).

Como "nunca para" sem PAT: o estado fica no BANCO (uf_status), não no workflow.
O GitHub Actions roda este script em cron (a cada 3h). Cada execução:
  1. Escolhe a PRÓXIMA UF a trabalhar (ordem de prioridade; RS primeiro).
  2. Roda siconfi_scraper.py + sync_to_neon.py com SICONFI_UFS=<UF> e um
     orçamento de tempo (sai limpo antes do teto de 6h do Actions).
  3. Mede a cobertura fiscal da UF. Se atingiu o mínimo → flip status='ready'
     (publica no Radar) e emite aviso. Senão, fica 'staging' e o próximo run
     continua de onde o status.json parou (scraper é resumível por arquivo).

Estados em 'staging' são INVISÍVEIS pro Radar (vw_municipios_publicados só vê
'ready'). Logo o backfill é seguro a QUALQUER ponto de interrupção. Vide
migration 0008_nacional_uf_gate.sql.

Uso:
  python3 backfill_nacional.py                 # processa 1 UF (a próxima da fila)
  TIME_BUDGET_MIN=300 python3 backfill_nacional.py   # com orçamento de 5h
  python3 backfill_nacional.py --uf RS         # força uma UF específica
  python3 backfill_nacional.py --status        # só imprime o progresso e sai
"""

import os
import subprocess
import sys
from datetime import datetime

try:
    import psycopg2
except ImportError:
    print("ERRO: psycopg2 não instalado. pip install psycopg2-binary")
    sys.exit(1)

BASE = os.path.dirname(os.path.abspath(__file__))

# Ordem de prioridade da fila. RS primeiro (pedido do Raphael), depois os
# maiores/mais relevantes, depois o resto. SP fica fora (já é 'ready').
FILA_PRIORIDADE = [
    "RS",                                      # pedido: começar aqui
    "MG", "PR", "SC", "BA", "GO", "PE", "CE",  # grandes / estratégicos
    "RJ", "PA", "MA", "PB", "ES", "RN", "MT",
    "MS", "PI", "AL", "SE", "TO", "RO", "AM",
    "AC", "AP", "RR",                          # AC já tem os 22 munis carregados
    "DF",                                      # ente único, sem municípios
]

# Cobertura mínima pra publicar uma UF: % de municípios com base fiscal
# (≥1 ponto em indicadores_lrf). Abaixo disso, o estado segue em staging.
COBERTURA_MINIMA_PCT = 80.0

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    envpath = os.path.join(BASE, "..", ".env.local")
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


def conectar():
    return psycopg2.connect(DATABASE_URL)


def cobertura_uf(conn, uf):
    """Retorna (munis_carregados, munis_com_fiscal, pct). Usa o /entes do
    SICONFI como universo esperado só depois que a UF tem municípios; antes
    disso, pct=0 força o scraping inicial."""
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM municipios WHERE uf = %s", (uf,))
        carregados = cur.fetchone()[0]
        cur.execute("""
            SELECT count(DISTINCT l.cod_ibge)
            FROM municipios m JOIN indicadores_lrf l ON l.cod_ibge = m.cod_ibge
            WHERE m.uf = %s
        """, (uf,))
        com_fiscal = cur.fetchone()[0]
    pct = (100.0 * com_fiscal / carregados) if carregados else 0.0
    return carregados, com_fiscal, pct


def proxima_uf(conn):
    """Primeira UF da fila de prioridade que ainda não está 'ready'."""
    with conn.cursor() as cur:
        cur.execute("SELECT uf, status FROM uf_status")
        status = dict(cur.fetchall())
    for uf in FILA_PRIORIDADE:
        if status.get(uf) != "ready":
            return uf
    return None  # Brasil inteiro publicado 🎉


def rodar(cmd, uf):
    """Roda um passo do pipeline com SICONFI_UFS=<uf>, propagando o orçamento
    de tempo. Não aborta o orquestrador se o passo falhar (igual ao run_daily)."""
    env = dict(os.environ, SICONFI_UFS=uf)
    log(f"  $ {' '.join(cmd)}  (SICONFI_UFS={uf})")
    r = subprocess.run(cmd, cwd=BASE, env=env)
    if r.returncode != 0:
        log(f"  ::warning:: {cmd[0]} {cmd[1]} retornou {r.returncode}")
    return r.returncode


def marcar_ready(conn, uf, pct):
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE uf_status
               SET status = 'ready', cobertura_pct = %s, atualizado_em = NOW()
             WHERE uf = %s
        """, (round(pct, 2), uf))
    conn.commit()


def atualizar_progresso(conn, uf, pct):
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE uf_status SET cobertura_pct = %s, atualizado_em = NOW()
             WHERE uf = %s
        """, (round(pct, 2), uf))
    conn.commit()


def imprimir_status(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT uf, status, munis_carregados, munis_com_fiscal, cobertura_pct
            FROM vw_progresso_nacional
        """)
        rows = cur.fetchall()
    ready = sum(1 for r in rows if r[1] == "ready")
    log(f"PROGRESSO NACIONAL — {ready}/27 UFs publicadas")
    for uf, st, carr, fisc, pct in rows:
        flag = "✅" if st == "ready" else ("⏳" if (carr or 0) > 0 else "  ")
        log(f"  {flag} {uf} {st:8} carregados={carr or 0:4} fiscal={fisc or 0:4} cob={pct or 0}%")


def main():
    if "--status" in sys.argv:
        conn = conectar()
        imprimir_status(conn)
        conn.close()
        return

    uf = None
    if "--uf" in sys.argv:
        uf = sys.argv[sys.argv.index("--uf") + 1].upper()

    conn = conectar()
    log("=" * 64)
    log("BACKFILL NACIONAL — base fiscal SICONFI (API oficial), UF a UF")
    log("=" * 64)

    if not uf:
        uf = proxima_uf(conn)
    if not uf:
        log("🎉 Brasil inteiro publicado (todas as UFs 'ready'). Nada a fazer.")
        imprimir_status(conn)
        conn.close()
        return

    log(f"UF da vez: {uf}")
    antes = cobertura_uf(conn, uf)
    log(f"  antes: {antes[0]} munis, {antes[1]} c/ fiscal ({antes[2]:.1f}%)")

    # 1. Coleta (API SICONFI) + 2. Sync → Neon (em staging, invisível p/ Radar)
    rodar([sys.executable, "siconfi_scraper.py"], uf)
    rodar([sys.executable, "sync_to_neon.py"], uf)

    # 3. Mede e decide o flip
    carr, fisc, pct = cobertura_uf(conn, uf)
    log(f"  depois: {carr} munis, {fisc} c/ fiscal ({pct:.1f}%)")

    if pct >= COBERTURA_MINIMA_PCT:
        marcar_ready(conn, uf, pct)
        log("=" * 64)
        log(f"✅ AVISO: {uf} COMPLETO ({pct:.1f}% ≥ {COBERTURA_MINIMA_PCT}%) — "
            f"PUBLICADO no Radar. {carr} municípios agora visíveis.")
        log("=" * 64)
        prox = proxima_uf(conn)
        log(f"Próxima UF da fila: {prox or '— fim, Brasil completo'}")
    else:
        atualizar_progresso(conn, uf, pct)
        log(f"⏳ {uf} ainda em staging ({pct:.1f}% < {COBERTURA_MINIMA_PCT}%) — "
            f"próximo run retoma de onde o status.json parou.")

    imprimir_status(conn)
    conn.close()


if __name__ == "__main__":
    main()
