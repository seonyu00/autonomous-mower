#!/usr/bin/env python3
"""Smoke test for cpp_map_cli's JSON stdin/stdout contract.

Guards against the ostream-precision bug where longitudes near 127.xxx were
silently truncated to 6 significant digits, collapsing every waypoint onto
the same longitude.
"""
import json
import subprocess
import sys

REQUEST = {
    "cell_size_m": 0.2,
    "polygon": [
        {"lat": 36.6262046, "lon": 127.4531102},
        {"lat": 36.6262046, "lon": 127.4533500},
        {"lat": 36.6260000, "lon": 127.4534200},
        {"lat": 36.6258171, "lon": 127.4533500},
        {"lat": 36.6258171, "lon": 127.4531102},
    ],
    "obstacles": [{"lat": 36.6260500, "lon": 127.4532500}],
}


def main():
    binary = sys.argv[1]
    proc = subprocess.run(
        [binary], input=json.dumps(REQUEST), capture_output=True, text=True, check=True
    )
    result = json.loads(proc.stdout)

    assert result["rows"] > 0 and result["columns"] > 0
    path = result["path"]
    assert len(path) > 0, "coverage path must not be empty"

    lons = [p["lon"] for p in path]
    lats = [p["lat"] for p in path]
    lon_span = max(lons) - min(lons)
    lat_span = max(lats) - min(lats)

    # The polygon spans ~0.00031 degrees of longitude and ~0.00039 of
    # latitude; a real sweep must resolve most of that, not collapse to a
    # single truncated value.
    assert lon_span > 0.0002, f"longitude span collapsed: {lon_span}"
    assert lat_span > 0.0002, f"latitude span collapsed: {lat_span}"

    print(f"OK: {len(path)} waypoints, lon_span={lon_span:.8f}, lat_span={lat_span:.8f}")


if __name__ == "__main__":
    main()
