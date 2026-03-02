#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"

BACKEND_PORT="${BACKEND_PORT:-13434}"
FRONTEND_PORT="${FRONTEND_PORT:-18982}"
FRONTEND_URL="http://localhost:${FRONTEND_PORT}"

backend_pid=""
frontend_pid=""

die() {
  echo "Error: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Command not found: $1"
}

free_port() {
  local port="$1"
  if ! command -v lsof >/dev/null 2>&1; then
    die "lsof not found; cannot free port ${port} automatically."
  fi

  local pids
  pids="$(lsof -ti "tcp:${port}" || true)"
  if [[ -n "${pids}" ]]; then
    echo "Killing processes on port ${port}: ${pids}"
    # Try graceful first, then force if needed
    kill ${pids} || true
    sleep 1
    if lsof -ti "tcp:${port}" >/dev/null 2>&1; then
      kill -9 ${pids} || true
      sleep 1
    fi
  fi
}

prepare_backend() {
  [[ -d "${BACKEND_DIR}" ]] || die "Backend directory not found at ${BACKEND_DIR}"
  cd "${BACKEND_DIR}"

  if [[ ! -d node_modules ]]; then
    echo "Installing backend dependencies..."
    npm install
  fi

  mkdir -p uploads/jobs temp
}

prepare_frontend() {
  [[ -d "${FRONTEND_DIR}" ]] || die "Frontend directory not found at ${FRONTEND_DIR}"
  cd "${FRONTEND_DIR}"

  if [[ ! -d node_modules ]]; then
    echo "Installing frontend dependencies..."
    npm install
  fi
}

start_backend() {
  cd "${BACKEND_DIR}"
  echo "Starting backend on port ${BACKEND_PORT}..."
  PORT="${BACKEND_PORT}" npm run dev &
  backend_pid=$!
}

start_frontend() {
  cd "${FRONTEND_DIR}"
  echo "Starting frontend on port ${FRONTEND_PORT}..."
  npm run dev -- --port "${FRONTEND_PORT}" &
  frontend_pid=$!
}

open_browser() {
  echo "Opening ${FRONTEND_URL} ..."
  if command -v open >/dev/null 2>&1; then
    open "${FRONTEND_URL}" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "${FRONTEND_URL}" >/dev/null 2>&1 || true
  else
    echo "Please open ${FRONTEND_URL} in your browser."
  fi
}

cleanup() {
  trap - INT TERM EXIT
  if [[ -n "${frontend_pid}" ]] && kill -0 "${frontend_pid}" >/dev/null 2>&1; then
    kill "${frontend_pid}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${backend_pid}" ]] && kill -0 "${backend_pid}" >/dev/null 2>&1; then
    kill "${backend_pid}" >/dev/null 2>&1 || true
  fi
}

main() {
  require_cmd node
  require_cmd npm
  require_cmd lsof

  free_port "${BACKEND_PORT}"
  free_port "${FRONTEND_PORT}"

  prepare_backend
  prepare_frontend

  trap cleanup INT TERM EXIT

  start_backend
  start_frontend

  open_browser

  echo "Backend PID: ${backend_pid}"
  echo "Frontend PID: ${frontend_pid}"
  echo "Press Ctrl+C to stop both."

  wait
}

main "$@"
