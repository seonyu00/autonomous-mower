#!/usr/bin/env bash

set -euo pipefail

source /opt/ros/humble/setup.bash
export PYTHONPATH="$(pwd):${PYTHONPATH:-}"

python3 -m jetson_mower_client "$@"

