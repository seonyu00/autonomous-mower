from pathlib import Path
import sys
import unittest


PROJECT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_DIR))

from jetson_video_streamer.config import VideoStreamConfig, load_config
from jetson_video_streamer.pipeline import build_gstreamer_pipeline


class VideoConfigTest(unittest.TestCase):
    def test_loads_srs_quality_defaults(self) -> None:
        config = load_config(PROJECT_DIR / "config.yaml.example")

        self.assertEqual(config.robot_id, "MOWER-01")
        self.assertEqual(config.width, 640)
        self.assertEqual(config.height, 480)
        self.assertEqual(config.fps, 15)
        self.assertEqual(config.bitrate_kbps, 500)
        self.assertEqual(
            config.rtsp_url,
            "rtsp://127.0.0.1:8554/mowers/MOWER-01",
        )

    def test_builds_nvenc_h264_rtsp_pipeline(self) -> None:
        pipeline = build_gstreamer_pipeline(VideoStreamConfig())

        self.assertIn("appsrc name=source", pipeline)
        self.assertIn("width=640,height=480,framerate=15/1", pipeline)
        self.assertIn("nvv4l2h264enc", pipeline)
        self.assertIn("bitrate=500000", pipeline)
        self.assertIn("video/x-h264,profile=baseline", pipeline)
        self.assertIn("rtspclientsink", pipeline)
        self.assertIn("rtsp://127.0.0.1:8554/mowers/MOWER-01", pipeline)

    def test_mediamtx_enables_tcp_ice_fallback(self) -> None:
        config = (PROJECT_DIR / "mediamtx.yml.example").read_text(
            encoding="utf-8"
        )

        self.assertIn("webrtcLocalTCPAddress: :8189", config)


if __name__ == "__main__":
    unittest.main()
