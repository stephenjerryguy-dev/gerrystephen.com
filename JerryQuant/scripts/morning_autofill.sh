#!/usr/bin/env bash
# JerryQuant — local morning auto-fill (Path B, hands-off)
#
# Runs every weekday at 9:40 AM ET via launchd
# (~/Library/LaunchAgents/com.jerryquant.autofill.plist).
#
# Sequence: fresh live_scan (read-only) -> live_execute of that same-session
# ticket. All existing safety gates still apply inside main.py: kill-switch
# file, 18h proposal staleness, price-deviation guard, per-position caps,
# Robinhood's own pre-trade review. The allocation strategy is drift-banded,
# so once the portfolio is at target this run proposes nothing and exits
# quietly — it only trades when drift exceeds the band.
#
# To stop everything:  touch JerryQuant/HALT_TRADING.txt
# To uninstall:        launchctl unload ~/Library/LaunchAgents/com.jerryquant.autofill.plist
set -uo pipefail

DIR="/Users/sergerald/Claude/Projects/jerryquant/JerryQuant"
PY="$DIR/.venv/bin/python"
LOG="$DIR/logs/autofill_$(date +%Y%m%d).log"
cd "$DIR"

echo "=== autofill run $(date '+%Y-%m-%d %H:%M:%S %Z') ===" >> "$LOG"

# Belt-and-braces market-hours guard (launchd already fires 9:40 Mon-Fri,
# but a delayed wake-from-sleep firing must not trade after hours).
DOW=$(date +%u)   # 1=Mon..7=Sun
HHMM=$(date +%H%M)
if [ "$DOW" -gt 5 ] || [ "$HHMM" -lt 0930 ] || [ "$HHMM" -gt 1545 ]; then
  echo "outside market window (dow=$DOW hhmm=$HHMM) — skipping" >> "$LOG"
  exit 0
fi

if [ -f "$DIR/HALT_TRADING.txt" ]; then
  echo "HALT_TRADING.txt present — skipping" >> "$LOG"
  exit 0
fi

echo "--- live_scan ---" >> "$LOG"
"$PY" main.py --mode live_scan >> "$LOG" 2>&1
SCAN_RC=$?
if [ $SCAN_RC -ne 0 ]; then
  echo "scan failed rc=$SCAN_RC — not executing" >> "$LOG"
  exit $SCAN_RC
fi

if [ ! -f "$DIR/live_pending.json" ]; then
  echo "no pending ticket (nothing to do)" >> "$LOG"
  exit 0
fi

echo "--- live_execute ---" >> "$LOG"
"$PY" main.py --mode live_execute >> "$LOG" 2>&1
EXEC_RC=$?

# One retry for the remainder if anything failed transiently (e.g. 429
# throttle). Drift-based allocation re-proposes only what is still missing.
if [ $EXEC_RC -ne 0 ] || grep -q "FAILED" "$LOG"; then
  echo "--- retry (15s backoff): rescan + execute remainder ---" >> "$LOG"
  sleep 15
  "$PY" main.py --mode live_scan >> "$LOG" 2>&1
  if [ -f "$DIR/live_pending.json" ]; then
    "$PY" main.py --mode live_execute >> "$LOG" 2>&1
  fi
fi

echo "=== autofill done $(date '+%H:%M:%S') ===" >> "$LOG"
