#!/usr/bin/env bash

set -eo pipefail
source /opt/ros/humble/setup.bash
set -u
client_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export PYTHONPATH="${client_dir}:${PYTHONPATH:-}"
exec python3 -B -m jetson_mower_client.monitor --config "${client_dir}/config.yaml"
