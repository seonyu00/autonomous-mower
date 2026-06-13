from pathlib import Path
import unittest


class RunScriptTest(unittest.TestCase):
    def test_ros_setup_is_loaded_before_nounset(self) -> None:
        script = (
            Path(__file__).resolve().parents[1] / "scripts" / "run-jetson-client.sh"
        ).read_text(encoding="utf-8")

        lines = script.splitlines()
        ros_setup_index = lines.index("source /opt/ros/humble/setup.bash")
        nounset_index = next(
            index
            for index, line in enumerate(lines)
            if line.startswith("set -") and "u" in line.split()[1]
        )

        self.assertLess(ros_setup_index, nounset_index)


if __name__ == "__main__":
    unittest.main()
