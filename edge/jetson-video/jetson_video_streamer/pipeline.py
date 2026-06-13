from __future__ import annotations

from .config import VideoStreamConfig


def build_gstreamer_pipeline(config: VideoStreamConfig) -> str:
    bitrate = config.bitrate_kbps * 1000
    return " ".join(
        [
            "appsrc name=source is-live=true format=time do-timestamp=true",
            (
                "! video/x-raw,format=RGB,"
                f"width={config.width},height={config.height},"
                f"framerate={config.fps}/1"
            ),
            "! queue max-size-buffers=2 leaky=downstream",
            "! videoconvert",
            "! video/x-raw,format=I420",
            "! nvvidconv",
            "! video/x-raw(memory:NVMM),format=NV12",
            (
                "! nvv4l2h264enc "
                f"bitrate={bitrate} control-rate=1 "
                f"iframeinterval={config.fps} insert-sps-pps=true"
            ),
            "! video/x-h264,profile=baseline",
            "! h264parse config-interval=1",
            (
                "! rtspclientsink protocols=tcp latency=0 "
                f"location={config.rtsp_url}"
            ),
        ]
    )
