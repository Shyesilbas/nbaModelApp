#!/usr/bin/env bash
set -euo pipefail

# Start FastAPI ML service, then frontend (Vite).
# ML service runs in background; frontend runs in foreground.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

ML_PID=""
FE_PID=""
CLEANED_UP=0

# Kill a process and all of its descendants (npm -> vite -> esbuild, uvicorn reloader -> worker).
kill_tree() {
  local pid="$1" sig="${2:-TERM}" child
  for child in $(pgrep -P "$pid" 2>/dev/null); do
    kill_tree "$child" "$sig"
  done
  kill "-$sig" "$pid" 2>/dev/null || true
}

stop_service() {
  local name="$1" pid="$2"
  [ -n "$pid" ] || return 0
  kill -0 "$pid" 2>/dev/null || return 0
  echo "Stopping $name (PID $pid)"
  kill_tree "$pid" TERM
  for _ in $(seq 1 50); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.1
  done
  kill_tree "$pid" KILL
}

on_exit() {
  [ "$CLEANED_UP" = 1 ] && return
  CLEANED_UP=1
  trap - INT TERM HUP
  printf '\nShutting down services...\n'
  stop_service "frontend" "$FE_PID"
  stop_service "ML service" "$ML_PID"
  # last resort: anything still holding the dev ports
  lsof -ti :5173 -sTCP:LISTEN 2>/dev/null | xargs kill -9 2>/dev/null || true
  lsof -ti :8001 -sTCP:LISTEN 2>/dev/null | xargs kill -9 2>/dev/null || true
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

# 1) Start FastAPI ML service
if command -v python3 >/dev/null 2>&1; then
  echo "Starting ML service..."
  if [ -f "requirements.txt" ]; then
    # create venv if missing
    if [ ! -d ".venv" ]; then
      echo "Creating .venv..."
      python3 -m venv .venv
      .venv/bin/pip install --upgrade pip >/dev/null
      .venv/bin/pip install -r requirements.txt >/dev/null
    else
      # pick up dependencies added since the venv was created (quick when nothing changed)
      .venv/bin/pip install -q -r requirements.txt >/dev/null 2>&1 || echo "Warning: could not sync requirements.txt"
    fi

    # free port 8001 if already bound by an orphan process
    lsof -ti :8001 | xargs kill -9 2>/dev/null || true

    # start uvicorn from REPO_ROOT; reload on any change under src/ (the API imports it)
    .venv/bin/python -m uvicorn src.api.main:app --host 127.0.0.1 --port 8001 --reload --reload-dir src &
    ML_PID=$!
    echo "ML service started (PID $ML_PID) on port 8001"
  else
    echo "requirements.txt not found — skipping ML service start"
  fi
else
  echo "python3 not found — cannot start ML service"
fi

# Wait until the API answers (model + cache warmup takes ~15 s) so the first page load succeeds
if [ -n "$ML_PID" ]; then
  echo "Waiting for ML service to become ready..."
  for _ in $(seq 1 90); do
    curl -fs -o /dev/null http://127.0.0.1:8001/health 2>/dev/null && break
    kill -0 "$ML_PID" >/dev/null 2>&1 || break
    sleep 1
  done
fi

# 2) Start frontend (Vite)
if command -v npm >/dev/null 2>&1 && [ -f "frontend/package.json" ]; then
  echo "Starting frontend (Vite)..."
  cd frontend
  if [ ! -d node_modules ]; then
    echo "Installing frontend dependencies (npm install) — this may take a while..."
    npm install --silent
  fi
  echo "Launching frontend dev server (npm run dev) — press Ctrl+C to stop everything"
  # run in background + wait so INT/TERM/HUP traps fire immediately (bash defers traps
  # while a foreground child runs) and cleanup can kill the whole vite process tree
  npm run dev &
  FE_PID=$!
  wait "$FE_PID" || true
else
  echo "npm not found or frontend/package.json missing — cannot start frontend"
fi

# If frontend exits, script will reach here and on_exit trap will run
exit 0
