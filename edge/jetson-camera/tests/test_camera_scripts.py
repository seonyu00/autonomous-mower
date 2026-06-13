from pathlib import Path
import unittest


PROJECT_DIR = Path(__file__).resolve().parents[1]
RUN_SCRIPT = PROJECT_DIR / "scripts" / "run-realsense-camera.sh"
VERIFY_SCRIPT = PROJECT_DIR / "scripts" / "verify-camera-output.sh"


class CameraScriptTest(unittest.TestCase):
    def test_run_script_uses_installed_realsense_launch_arguments(self) -> None:
        script = RUN_SCRIPT.read_text(encoding="utf-8")

        self.assertIn("rgb_camera.color_profile:=640,480,15", script)
        self.assertIn("depth_module.depth_profile:=640,480,15", script)
        self.assertNotIn("rgb_camera.profile:=", script)
        self.assertNotIn("depth_module.profile:=", script)

    def test_run_script_starts_external_compressed_image_republisher(self) -> None:
        script = RUN_SCRIPT.read_text(encoding="utf-8")

        self.assertIn("camera.color.image_raw.enable_pub_plugins", script)
        self.assertIn("ros2 run image_transport republish", script)
        self.assertIn("raw in:=/camera/camera/color/image_raw", script)
        self.assertIn(
            "out/compressed:=/camera/camera/color/image_raw/compressed",
            script,
        )

    def test_run_script_terminates_camera_process_groups(self) -> None:
        script = RUN_SCRIPT.read_text(encoding="utf-8")

        self.assertGreaterEqual(script.count("setsid"), 2)
        self.assertIn('kill -- "-$child_pid"', script)

    def test_run_script_loads_ros_before_enabling_nounset(self) -> None:
        lines = RUN_SCRIPT.read_text(encoding="utf-8").splitlines()

        ros_setup_index = lines.index('source "$ROS_SETUP"')
        nounset_index = next(
            index
            for index, line in enumerate(lines)
            if line.startswith("set -") and "u" in line.split()[1]
        )

        self.assertLess(ros_setup_index, nounset_index)

    def test_verify_script_checks_resolution_rate_and_jpeg_payload(self) -> None:
        script = VERIFY_SCRIPT.read_text(encoding="utf-8")

        self.assertIn("EXPECTED_WIDTH=640", script)
        self.assertIn("EXPECTED_HEIGHT=480", script)
        self.assertIn("MIN_HZ=12", script)
        self.assertIn("MAX_HZ=18", script)
        self.assertIn("jpeg", script.lower())
        self.assertIn("len(compressed_message.data)", script)
        self.assertIn("len(self.compressed_message.data) > 0", script)


if __name__ == "__main__":
    unittest.main()
