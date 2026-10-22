from pathlib import Path
import unittest

import yaml


class TailnetConfigTest(unittest.TestCase):
    def setUp(self):
        path = Path(__file__).resolve().parents[1] / "mediamtx-tailnet.v1.9.yml.example"
        self.config = yaml.safe_load(path.read_text(encoding="utf-8"))

    def test_management_and_publish_listeners_remain_loopback_only(self):
        for field, port in [("rtspAddress", 8554), ("webrtcAddress", 8889), ("apiAddress", 9997)]:
            self.assertEqual(self.config[field], f"127.0.0.1:{port}")
        for field in ["rtmp", "hls", "srt", "playback"]:
            self.assertFalse(self.config[field])
        self.assertEqual(self.config["protocols"], ["tcp"])
        self.assertNotIn("rtspTransports", self.config)

    def test_reader_cannot_publish_or_administer_and_origin_is_explicit(self):
        reader = self.config["authInternalUsers"][1]
        self.assertEqual(reader["ips"], ["<VIEWER_TAILSCALE_IP>/32"])
        self.assertEqual(reader["permissions"], [{"action": "read", "path": "mowers/<ROBOT_ID>"}])
        self.assertEqual(self.config["webrtcAllowOrigin"], "https://<FRONTEND_HOST>")
        self.assertNotIn("webrtcAllowOrigins", self.config)
        self.assertFalse(self.config["webrtcIPsFromInterfaces"])

    def test_last_reader_close_stops_on_demand_publisher_without_delay(self):
        path = self.config["paths"]["mowers/<ROBOT_ID>"]
        self.assertIn("run-video-streamer.sh", path["runOnDemand"])
        self.assertEqual(path["runOnDemandCloseAfter"], "0s")


if __name__ == "__main__":
    unittest.main()
