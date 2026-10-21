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
    cd ml-service
    # create venv if missing
    if [ ! -d ".venv" ]; then
      echo "Creating .venv for ml-service..."
      python3 -m venv .venv
      . .venv/bin/activate
      pip install --upgrade pip >/dev/null
      pip install -r "$REPO_ROOT/requirements.txt" >/dev/null
    else
      . .venv/bin/activate
    fi

    # free port 8001 if already bound by an orphan process
    lsof -ti :8001 | xargs kill -9 2>/dev/null || true

    # start uvicorn from REPO_ROOT with auto-reload for app directory
    cd "$REPO_ROOT"
    "$REPO_ROOT/ml-service/.venv/bin/python" -m uvicorn app.main:app --app-dir ml-service --host 127.0.0.1 --port 8001 --reload --reload-dir ml-service/app &
    ML_PID=$!
    echo "ML service started (PID $ML_PID) on port 8001"
    deactivate || true
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
