from pathlib import Path
import tempfile
import unittest
from jetson_mower_client.cpp_camera_preview import save_frame
from jetson_mower_client.cpp_trial import diagnostic, read_json


class CameraPreviewTest(unittest.TestCase):
    def test_empty_frames_are_rejected_and_duplicate_poll_does_not_renew_timestamp(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory)
            self.assertEqual(save_frame(p, b'', 1000000, 1, 0), 0)
            self.assertFalse((p / 'camera.jpg').exists())
            jpeg = b'\xff\xd8test\xff\xd9'
            self.assertEqual(save_frame(p, jpeg, 1000000, 1, 0), 1)
            self.assertEqual(save_frame(p, jpeg, 2000000, 1.1, 1), 1)
            self.assertEqual(read_json(p / 'camera.json')['capture_unix_ms'], 1)

    def test_only_guard_capture_is_selected_and_no_arbitrary_path_is_read(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory)
            (p / '001-raw-guard.png').write_bytes(b'png')
            (p / '001.json').write_text('{"capture_timestamp_ns":1}')
            (p / '002-rgb.png').write_bytes(b'png')
            info, image = diagnostic(p)
            self.assertEqual(info['capture_timestamp_ns'], 1)
            self.assertEqual(image.name, '001-raw-guard.png')
