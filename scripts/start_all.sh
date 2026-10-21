#!/usr/bin/env bash
set -euo pipefail

# Start FastAPI ML service, then frontend (Vite).
# ML service runs in background; frontend runs in foreground.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

ML_PID=""

on_exit() {
  echo "\nShutting down services..."
  if [ -n "$ML_PID" ] && kill -0 "$ML_PID" >/dev/null 2>&1; then
    echo "Stopping ML service (PID $ML_PID)"; kill "$ML_PID" || true
  fi
  wait 2>/dev/null || true
}
trap on_exit EXIT INT TERM

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

# Give ML service a moment to initialize
sleep 1

# 2) Start frontend (Vite)
if command -v npm >/dev/null 2>&1 && [ -f "frontend/package.json" ]; then
  echo "Starting frontend (Vite)..."
  cd frontend
  if [ ! -d node_modules ]; then
    echo "Installing frontend dependencies (npm install) — this may take a while..."
    npm install --silent
  fi
  echo "Launching frontend dev server (npm run dev) — press Ctrl+C to stop everything"
  npm run dev
  # frontend runs in foreground; when it exits, script continues to trap and cleanup
else
  echo "npm not found or frontend/package.json missing — cannot start frontend"
fi

# If frontend exits, script will reach here and on_exit trap will run
exit 0
