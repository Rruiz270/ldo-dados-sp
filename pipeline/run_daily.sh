#!/bin/zsh
# Wrapper diário para os 2 scrapers (SICONFI + Audesp).
# Chamado via cron: ver crontab.txt deste diretório.

set -u
cd "$(dirname "$0")"

STAMP=$(date +"%Y-%m-%d_%H-%M-%S")
LOG_DIR="logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/run_${STAMP}.log"
START_TS=$(date +%s)

# Roda em sequência (não paralelo) pra não saturar conexão nem disco.
{
  echo "=================================================="
  echo "Run iniciado: $(date)"
  echo "=================================================="
  echo ""
  echo "--- SICONFI ---"
  /usr/bin/env python3 siconfi_scraper.py
  echo ""
  echo "--- Audesp/TCE-SP ---"
  /usr/bin/env python3 audesp_downloader.py
  echo ""
  echo "--- Sync → Neon (ldo-dados-sp) ---"
  /usr/bin/env python3 sync_to_neon.py
  echo ""
  echo "Run finalizado: $(date)"
} >> "$LOG_FILE" 2>&1

ELAPSED=$(( $(date +%s) - START_TS ))
H=$(( ELAPSED / 3600 ))
M=$(( (ELAPSED % 3600) / 60 ))

# Resumo extraído do log (última linha de cada scraper costuma ter o FIM)
SUMMARY=$(grep -E "^\[.*\] (FIM|baixados|FALHA)" "$LOG_FILE" | tail -6 | tr '\n' ' | ')

# Notificação macOS nativa (banner no canto + Notification Center)
/usr/bin/osascript -e "display notification \"Duração: ${H}h${M}m. $SUMMARY\" with title \"Fundeb-SP scrapers\" subtitle \"Run finalizado $(date '+%H:%M')\" sound name \"Glass\""

# Mantém só os últimos 30 logs
ls -1t "$LOG_DIR"/run_*.log 2>/dev/null | tail -n +31 | xargs -I {} rm -f {}
