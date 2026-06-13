from pathlib import Path
import unittest


class RunScriptTest(unittest.TestCase):
    def test_ros_setup_is_loaded_before_nounset(self) -> None:
        script = (
            Path(__file__).resolve().parents[1]
            / "scripts"
            / "run-video-streamer.sh"
        ).read_text(encoding="utf-8")

        lines = script.splitlines()
        ros_setup_index = lines.index('source "$ROS_SETUP"')
        nounset_index = next(
            index
            for index, line in enumerate(lines)
            if line.startswith("set -") and "u" in line.split()[1]
        )

        self.assertLess(ros_setup_index, nounset_index)

    def test_ros_client_is_initialized_before_node_creation(self) -> None:
        main_path = (
            Path(__file__).resolve().parents[1]
            / "jetson_video_streamer"
            / "main.py"
        )
        content = main_path.read_text(encoding="utf-8")

        init_index = content.index("rclpy.init()")
        node_index = content.index("node = VideoStreamerNode()")

        self.assertLess(init_index, node_index)


if __name__ == "__main__":
    unittest.main()
