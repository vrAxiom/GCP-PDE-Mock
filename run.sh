#!/usr/bin/env bash
set -euo pipefail

DEFAULT_PORT="${1:-8000}"
HOST="${HOST:-127.0.0.1}"

is_port_in_use() {
  local port="$1"
  lsof -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
}

find_available_port() {
  local port="$1"
  while is_port_in_use "${port}"; do
    port=$((port + 1))
  done
  echo "${port}"
}

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to run the local server." >&2
  exit 1
fi

PORT="$(find_available_port "${DEFAULT_PORT}")"
URL="http://${HOST}:${PORT}"

if [[ "${PORT}" != "${DEFAULT_PORT}" ]]; then
  echo "Port ${DEFAULT_PORT} is in use. Using next available port ${PORT}."
fi

echo "Launching app at ${URL}"

exec python3 -m http.server "${PORT}" --bind "${HOST}"
