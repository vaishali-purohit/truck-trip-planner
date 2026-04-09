#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

log() {
  printf "%s\n" "$*"
}

log_err() {
  printf "%s\n" "$*" >&2
}

die() {
  printf "%s\n" "$*" >&2
  exit 1
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || die "Missing required command: $cmd"
}

cleanup() {
  kill 0 >/dev/null 2>&1 || true
}
trap cleanup INT TERM EXIT

is_port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -i ":${port}" >/dev/null 2>&1
    return $?
  fi
  return 1
}

pick_free_port() {
  local base="$1"
  local max_tries="${2:-20}"
  local p="$base"
  local i=0
  while is_port_in_use "$p" && [[ "$i" -lt "$max_tries" ]]; do
    p=$((p + 1))
    i=$((i + 1))
  done
  printf "%s" "$p"
}

BACKEND_STARTED=0
FRONTEND_STARTED=0

ensure_env_file() {
  local dir="$1"
  local env_path="$dir/.env"
  local tpl_path="$dir/.env.template"
  if [[ -f "$env_path" ]]; then
    return 0
  fi
  if [[ -f "$tpl_path" ]]; then
    cp "$tpl_path" "$env_path"
    log "Created $env_path from template."
  else
    log "No .env or .env.template found in $dir (skipping)."
  fi
}

ensure_backend_venv_and_deps() {
  require_cmd python3

  local venv_dir="${BACKEND_VENV_DIR:-}"
  if [[ -z "${venv_dir}" ]]; then
    if [[ -d "$BACKEND_DIR/venv" ]]; then
      venv_dir="$BACKEND_DIR/venv"
    else
      venv_dir="$BACKEND_DIR/.venv"
    fi
  fi

  local py="$venv_dir/bin/python"
  if [[ ! -x "$py" ]]; then
    log_err "Creating backend venv at: $venv_dir"
    python3 -m venv "$venv_dir"
  fi

  if [[ ! -f "$BACKEND_DIR/requirements.txt" ]]; then
    die "Missing backend requirements file: $BACKEND_DIR/requirements.txt"
  fi

  log_err "Installing backend dependencies..."
  (cd "$BACKEND_DIR" && "$py" -m pip install --upgrade pip >/dev/null 2>&1)
  (cd "$BACKEND_DIR" && "$py" -m pip install -r requirements.txt >&2)

  log_err "Running backend migrations..."
  (cd "$BACKEND_DIR" && "$py" manage.py migrate >&2)

  printf "%s" "$py"
}

ensure_frontend_deps() {
  require_cmd node
  require_cmd npm

  if [[ ! -f "$FRONTEND_DIR/package.json" ]]; then
    die "Missing frontend package.json: $FRONTEND_DIR/package.json"
  fi

  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    log "Installing frontend dependencies..."
    (cd "$FRONTEND_DIR" && npm install)
  fi
}

log "Bootstrapping environment files..."
ensure_env_file "$BACKEND_DIR"
ensure_env_file "$FRONTEND_DIR"

log "Bootstrapping backend..."
BACKEND_PY="$(ensure_backend_venv_and_deps)"

log "Bootstrapping frontend..."
ensure_frontend_deps

if is_port_in_use "$BACKEND_PORT"; then
  local_backend_port="$(pick_free_port "$BACKEND_PORT")"
  if [[ "$local_backend_port" != "$BACKEND_PORT" ]]; then
    log "Backend port $BACKEND_PORT is in use; using $local_backend_port instead."
    BACKEND_PORT="$local_backend_port"
  fi
fi

if is_port_in_use "$BACKEND_PORT"; then
  log "Backend port $BACKEND_PORT is already in use. Skipping backend start."
else
  log "Starting backend (Django) on http://127.0.0.1:$BACKEND_PORT ..."
  (cd "$BACKEND_DIR" && "$BACKEND_PY" manage.py runserver "127.0.0.1:$BACKEND_PORT") &
  BACKEND_STARTED=1
fi

log "Starting frontend (Vite) on http://127.0.0.1:$FRONTEND_PORT ..."
if is_port_in_use "$FRONTEND_PORT"; then
  local_frontend_port="$(pick_free_port "$FRONTEND_PORT")"
  if [[ "$local_frontend_port" != "$FRONTEND_PORT" ]]; then
    log "Frontend port $FRONTEND_PORT is in use; using $local_frontend_port instead."
    FRONTEND_PORT="$local_frontend_port"
  fi
fi

if is_port_in_use "$FRONTEND_PORT"; then
  log "Frontend port $FRONTEND_PORT is already in use. Skipping frontend start."
else
  (cd "$FRONTEND_DIR" && npm run dev -- --port "$FRONTEND_PORT") &
  FRONTEND_STARTED=1
fi

if [[ "$BACKEND_STARTED" -eq 0 && "$FRONTEND_STARTED" -eq 0 ]]; then
  log "Nothing started."
  exit 0
fi

log ""
log "App running:"
log "- Backend:  http://127.0.0.1:$BACKEND_PORT/api/"
log "- Swagger:  http://127.0.0.1:$BACKEND_PORT/api/docs/"
log "- Frontend: http://127.0.0.1:$FRONTEND_PORT/"
log ""

wait

