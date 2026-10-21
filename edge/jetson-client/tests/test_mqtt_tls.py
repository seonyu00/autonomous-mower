from __future__ import annotations

import json
import os
import ssl
import tempfile
import threading
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlparse

from jetson_mower_client.config import MqttConfig, _mqtt_config, load_config
from jetson_mower_client.mqtt_edge import MqttEdgeClient
from jetson_mower_client.topics import MowerTopics


def edge_config():
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "config.yaml"
        path.write_text("robot_id: SECURITY-TEST-01\n", encoding="utf-8")
        return load_config(path)


class MqttTlsTest(unittest.TestCase):
    def test_yaml_loads_optional_ca_path(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.yaml"
            path.write_text(
                "mqtt:\n  broker_url: mqtts://localhost:18886\n  ca_cert_path: /test/ca.pem\n",
                encoding="utf-8",
            )
            self.assertEqual(getattr(load_config(path).mqtt, "ca_cert_path", None), "/test/ca.pem")

    def test_ca_with_plaintext_url_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "mqtts://"):
            _mqtt_config({"broker_url": "mqtt://localhost:18886", "ca_cert_path": "/test/ca.pem"}, "test")

    def test_plaintext_default_keeps_existing_constructor_compatible(self) -> None:
        mqtt_config = MqttConfig("mqtt://localhost:1883", None, None, "test", 30, 2, 256)
        with patch("jetson_mower_client.mqtt_edge.mqtt.Client") as client_type:
            MqttEdgeClient(replace(edge_config(), mqtt=mqtt_config), MowerTopics("test"), lambda *_: None, lambda _: None)
        client_type.return_value.tls_set.assert_not_called()
        client_type.return_value.tls_set_context.assert_not_called()

    def test_tls_uses_ca_and_requires_hostname_verification_and_tls12(self) -> None:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        config = replace(edge_config(), mqtt=_mqtt_config(
            {"broker_url": "mqtts://localhost:18886", "ca_cert_path": "/test/ca.pem"}, "test"
        ))
        with patch("jetson_mower_client.mqtt_edge.ssl.create_default_context", return_value=context) as create_context:
            with patch("jetson_mower_client.mqtt_edge.mqtt.Client") as client_type:
                MqttEdgeClient(config, MowerTopics("test"), lambda *_: None, lambda _: None)
        create_context.assert_called_once_with(cafile="/test/ca.pem")
        client_type.return_value.tls_set_context.assert_called_once_with(context)
        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(context.check_hostname)
        self.assertGreaterEqual(context.minimum_version, ssl.TLSVersion.TLSv1_2)

    def test_tls_without_custom_ca_uses_system_roots(self) -> None:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        config = replace(edge_config(), mqtt=_mqtt_config({"broker_url": "mqtts://localhost:18886"}, "test"))
        with patch("jetson_mower_client.mqtt_edge.ssl.create_default_context", return_value=context) as create_context:
            with patch("jetson_mower_client.mqtt_edge.mqtt.Client"):
                MqttEdgeClient(config, MowerTopics("test"), lambda *_: None, lambda _: None)
        create_context.assert_called_once_with(cafile=None)

    def test_missing_ca_file_fails_before_connection(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config = replace(edge_config(), mqtt=_mqtt_config({
                "broker_url": "mqtts://localhost:18886", "ca_cert_path": str(Path(directory) / "missing.pem")
            }, "test"))
            with self.assertRaises(FileNotFoundError):
                MqttEdgeClient(config, MowerTopics("test"), lambda *_: None, lambda _: None)


@unittest.skipUnless(os.environ.get("MQTT_SECURITY_CONFIG"), "MQTT_SECURITY_CONFIG 없음: 격리 브로커 TLS 검증 생략")
class MqttTlsBrokerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.fixture = json.loads(Path(os.environ["MQTT_SECURITY_CONFIG"]).read_text(encoding="utf-8-sig"))
        parsed = urlparse(cls.fixture["brokerUrl"])
        if (parsed.scheme != "mqtts" or parsed.hostname not in {"localhost", "127.0.0.1"}
                or parsed.port != 18886 or parsed.username or parsed.password or parsed.path
                or parsed.query or parsed.fragment):
            raise ValueError("격리된 loopback mqtts://localhost:18886만 검증할 수 있습니다.")
        if cls.fixture["robotIds"] != ["SECURITY-TEST-01", "SECURITY-TEST-02"]:
            raise ValueError("전용 SECURITY-TEST-01/02만 검증할 수 있습니다.")

    def make_client(self, account="edge1", ca_key="caCertPath", broker_url=None):
        robot_id = self.fixture["robotIds"][0 if account == "edge1" else 1]
        account_config = self.fixture["accounts"][account]
        config = replace(edge_config(), robot_id=robot_id, mqtt=_mqtt_config({
            "broker_url": broker_url or self.fixture["brokerUrl"],
            "ca_cert_path": self.fixture[ca_key],
            "username": account_config["username"],
            "password": account_config["password"],
            "client_id": f"python-tls-{robot_id}",
        }, robot_id))
        connected = threading.Event()
        def log(message):
            if message.startswith("mqtt connected "):
                connected.set()
        return MqttEdgeClient(config, MowerTopics(robot_id), lambda *_: None, log), connected

    def test_trusted_ca_connects_both_test_edges(self) -> None:
        for account in ("edge1", "edge2"):
            with self.subTest(account=account):
                client, connected = self.make_client(account=account)
                try:
                    client.connect()
                    self.assertTrue(connected.wait(8), "정상 CA와 계정으로 CONNACK를 받지 못했습니다.")
                finally:
                    client.disconnect()

    def test_untrusted_ca_rejected(self) -> None:
        client, _ = self.make_client(ca_key="wrongCaCertPath")
        try:
            with self.assertRaises(ssl.SSLCertVerificationError):
                client.connect()
        finally:
            client.disconnect()

    def test_hostname_mismatch_rejected(self) -> None:
        client, _ = self.make_client(broker_url="mqtts://127.0.0.1:18886")
        try:
            with self.assertRaises(ssl.SSLCertVerificationError) as error:
                client.connect()
            self.assertIn(error.exception.verify_code, (62, 64))
        finally:
            client.disconnect()


if __name__ == "__main__":
    unittest.main()
