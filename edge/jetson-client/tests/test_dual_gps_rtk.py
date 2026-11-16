import json
import os
from pathlib import Path
import tempfile
import unittest

from jetson_mower_client.dual_gps_rtk import correction_command


@unittest.skipUnless(hasattr(os, 'getuid'), 'Linux 사용자·파일 권한 시험')
class DualGpsRtkTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        self.config = root / 'ntrip.json'
        self.config.write_text(json.dumps({'ntripUrl': 'ntrip://example.invalid/TEST'}))
        self.config.chmod(0o600)
        self.main = root / 'ttyCH341USB1'
        self.auxiliary = root / 'ttyCH341USB0'
        self.main.touch()
        self.auxiliary.touch()

    def command(self):
        return correction_command(self.config, self.main, self.auxiliary, '/test/str2str')

    def test_same_correction_is_sent_to_both_distinct_receivers(self):
        self.assertEqual(self.command()[-4:], ['-out', 'serial://ttyCH341USB1:115200',
                                              '-out', 'serial://ttyCH341USB0:115200'])

    def test_public_configuration_rejected(self):
        self.config.chmod(0o644)
        with self.assertRaises(ValueError):
            self.command()

    def test_invalid_settings_and_same_receiver_rejected(self):
        for settings in ([], {}, {'ntripUrl': 'https://example.invalid/TEST'}):
            self.config.write_text(json.dumps(settings))
            with self.assertRaises(ValueError):
                self.command()
        self.config.write_text(json.dumps({'ntripUrl': 'ntrip://example.invalid/TEST'}))
        with self.assertRaises(ValueError):
            correction_command(self.config, self.main, self.main, '/test/str2str')
