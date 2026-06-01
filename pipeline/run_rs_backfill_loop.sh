#!/bin/zsh
# Backfill ISOLADO do RS (apartado do cron das 04:00, que é SP-only).
# Roda passadas resumíveis do backfill_nacional.py --uf RS até o RS atingir a
# cobertura mínima e virar status='ready' (aí aparece em /ldo-dados), ou até o
# teto de passadas. O scraper resume via status.json, então cada passada começa
# de onde a anterior parou. Mac mini 24/7 → seguro rodar destacado (nohup).
set -u
cd "$(dirname "$0")"

# Ambiente: extrai o DATABASE_URL do .env.local SEM sourcear (o valor tem '&'
# nos query params do Postgres, que quebra o parser do shell). É o único env
# que backfill/scraper/sync precisam — SICONFI é API pública sem chave.
DBLINE=$(grep -E '^DATABASE_URL=' ../.env.local | head -1 | cut -d= -f2-)
DBLINE=${DBLINE#\"}; DBLINE=${DBLINE%\"}; DBLINE=${DBLINE#\'}; DBLINE=${DBLINE%\'}
export DATABASE_URL="$DBLINE"
[ -n "$DATABASE_URL" ] || { echo "ERRO: DATABASE_URL não encontrado em ../.env.local"; exit 1; }

STAMP=$(date +"%Y-%m-%d_%H-%M-%S")
LOG_DIR="logs"; mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/rs_backfill_loop_${STAMP}.log"

MAX_PASSADAS=${MAX_PASSADAS:-30}
TIME_BUDGET_MIN=${TIME_BUDGET_MIN:-40}
export TIME_BUDGET_MIN

status_rs() {
  python3 - <<'PY'
import os, psycopg2
c=psycopg2.connect(os.environ["DATABASE_URL"]); cur=c.cursor()
cur.execute("SELECT status, COALESCE(cobertura_pct,0) FROM uf_status WHERE uf='RS'")
st,pct=cur.fetchone()
cur.execute("SELECT count(DISTINCT f.cod_ibge) FROM municipios m JOIN indicadores_fiscais f ON f.cod_ibge=m.cod_ibge WHERE m.uf='RS'")
fisc=cur.fetchone()[0]
cur.execute("SELECT count(*) FROM municipios WHERE uf='RS'")
tot=cur.fetchone()[0]
print(f"{st}|{pct}|{fisc}|{tot}")
PY
}

{
  echo "=================================================="
  echo "RS BACKFILL LOOP — início $(date)"
  echo "  max_passadas=$MAX_PASSADAS  budget/passada=${TIME_BUDGET_MIN}min"
  echo "=================================================="
  for i in $(seq 1 "$MAX_PASSADAS"); do
    echo ""
    echo "===== PASSADA $i/$MAX_PASSADAS — $(date) ====="
    python3 backfill_nacional.py --uf RS
    INFO=$(status_rs)
    ST=${INFO%%|*}
    echo ">>> status RS após passada $i: $INFO  (status|cobertura_pct|munis_fiscal|munis_total)"
    if [ "$ST" = "ready" ]; then
      echo ""
      echo "🎉 RS atingiu 'ready' na passada $i — visível em /ldo-dados. Encerrando loop."
      break
    fi
  done
  echo ""
  echo "RS BACKFILL LOOP — fim $(date)"
} >> "$LOG" 2>&1

echo "$LOG"
