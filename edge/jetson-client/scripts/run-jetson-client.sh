#!/usr/bin/env bash

set -eo pipefail

source /opt/ros/humble/setup.bash
set -u
export PYTHONPATH="$(pwd):${PYTHONPATH:-}"

python3 -m jetson_mower_client "$@"
