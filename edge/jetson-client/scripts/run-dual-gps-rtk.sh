#!/usr/bin/env bash
set -euo pipefail
client_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export PYTHONPATH="${client_dir}"
for device in /dev/gps_main /dev/gps_aux; do
  while [[ ! -e "$device" ]]; do sleep 1; done
done
exec python3 -B -m jetson_mower_client.dual_gps_rtk --config "${HOME}/.config/mower-dual-gps/ntrip.json"
