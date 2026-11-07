#!/usr/bin/env bash
set -euo pipefail
client_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export PYTHONPATH="${client_dir}:${PYTHONPATH:-}"
exec python3 -B -m jetson_mower_client.web_work_zone "$@"
