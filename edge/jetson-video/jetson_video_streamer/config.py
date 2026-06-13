from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml


@dataclass(frozen=True)
class VideoStreamConfig:
    robot_id: str = "MOWER-01"
    image_topic: str = "/camera/camera/color/image_raw"
    width: int = 640
    height: int = 480
    fps: int = 15
    bitrate_kbps: int = 500
    rtsp_base_url: str = "rtsp://127.0.0.1:8554"

    @property
    def rtsp_url(self) -> str:
        return f"{self.rtsp_base_url.rstrip('/')}/mowers/{self.robot_id}"


def load_config(path: str | Path) -> VideoStreamConfig:
    with Path(path).open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle) or {}

    return VideoStreamConfig(
        robot_id=str(raw.get("robot_id", "MOWER-01")),
        image_topic=str(
            raw.get("image_topic", "/camera/camera/color/image_raw")
        ),
        width=int(raw.get("width", 640)),
        height=int(raw.get("height", 480)),
        fps=int(raw.get("fps", 15)),
        bitrate_kbps=int(raw.get("bitrate_kbps", 500)),
        rtsp_base_url=str(
            raw.get("rtsp_base_url", "rtsp://127.0.0.1:8554")
        ),
    )
