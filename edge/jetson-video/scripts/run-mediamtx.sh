#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MEDIAMTX_BIN="${MEDIAMTX_BIN:-$PROJECT_DIR/bin/mediamtx}"
MEDIAMTX_CONFIG="${MEDIAMTX_CONFIG:-$PROJECT_DIR/mediamtx.yml}"

if [[ ! -x "$MEDIAMTX_BIN" ]]; then
  echo "MediaMTX 실행 파일을 찾을 수 없습니다: $MEDIAMTX_BIN" >&2
  exit 1
fi

if [[ ! -f "$MEDIAMTX_CONFIG" ]]; then
  echo "MediaMTX 설정 파일을 찾을 수 없습니다: $MEDIAMTX_CONFIG" >&2
  exit 1
fi

exec "$MEDIAMTX_BIN" "$MEDIAMTX_CONFIG"
