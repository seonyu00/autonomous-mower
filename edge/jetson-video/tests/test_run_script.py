from pathlib import Path
import unittest


class RunScriptTest(unittest.TestCase):
    def test_demo_launcher_starts_camera_before_media_services(self) -> None:
        script_path = (
            Path(__file__).resolve().parents[1]
            / "scripts"
            / "run-video-demo.sh"
        )
        script = script_path.read_text(encoding="utf-8")

        camera_index = script.index('setsid "$CAMERA_SCRIPT"')
        camera_ready_index = script.index("\nwait_for_camera\n")
        mediamtx_index = script.index('setsid "$MEDIAMTX_SCRIPT"')
        streamer_index = script.index('setsid "$STREAMER_SCRIPT"')

        self.assertLess(camera_index, camera_ready_index)
        self.assertLess(camera_ready_index, mediamtx_index)
        self.assertLess(mediamtx_index, streamer_index)

    def test_demo_launcher_cleans_up_all_process_groups(self) -> None:
        script_path = (
            Path(__file__).resolve().parents[1]
            / "scripts"
            / "run-video-demo.sh"
        )
        script = script_path.read_text(encoding="utf-8")

        self.assertIn("trap cleanup EXIT INT TERM", script)
        self.assertIn(
            'for child_pid in "$streamer_pid" "$mediamtx_pid" "$camera_pid"',
            script,
        )
        self.assertIn('kill -- "-$child_pid"', script)
        self.assertIn(
            'wait -n "$camera_pid" "$mediamtx_pid" "$streamer_pid"',
            script,
        )

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
