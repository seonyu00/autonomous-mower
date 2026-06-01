from __future__ import annotations

import json
import ssl
from collections.abc import Callable
from typing import Any

import paho.mqtt.client as mqtt

from .config import EdgeConfig
from .topics import MowerTopics


MessageHandler = Callable[[str, dict[str, Any] | None, bytes], None]
LogHandler = Callable[[str], None]


class MqttEdgeClient:
    def __init__(self, config: EdgeConfig, topics: MowerTopics, on_message: MessageHandler, log: LogHandler) -> None:
        self._config = config
        self._topics = topics
        self._on_message = on_message
        self._log = log
        self._client = mqtt.Client(client_id=config.mqtt.client_id, clean_session=True)

        if config.mqtt.username:
            self._client.username_pw_set(config.mqtt.username, config.mqtt.password)
        if config.mqtt.use_tls:
            self._client.tls_set(cert_reqs=ssl.CERT_REQUIRED)
        self._client.reconnect_delay_set(
            min_delay=config.mqtt.reconnect_delay_seconds,
            max_delay=max(config.mqtt.reconnect_delay_seconds, 30),
        )

        self._client.on_connect = self._handle_connect
        self._client.on_message = self._handle_message
        self._client.on_disconnect = self._handle_disconnect

    def connect(self) -> None:
        self._client.connect(
            self._config.mqtt.host,
            self._config.mqtt.port,
            keepalive=self._config.mqtt.keepalive_seconds,
        )
        self._client.loop_start()

    def disconnect(self) -> None:
        self._client.loop_stop()
        self._client.disconnect()

    def publish_json(self, topic: str, payload: dict[str, Any], qos: int) -> None:
        self._client.publish(topic, json.dumps(payload, separators=(",", ":")), qos=qos, retain=False)

    def _handle_connect(self, client: mqtt.Client, _userdata: Any, _flags: dict[str, Any], rc: int) -> None:
        if rc != 0:
            self._log(f"mqtt connect failed rc={rc}")
            return

        self._log(f"mqtt connected broker={self._config.mqtt.broker_url}")
        for topic, qos in self._topics.command_subscriptions():
            client.subscribe(topic, qos=qos)
            self._log(f"mqtt subscribed topic={topic} qos={qos}")

    def _handle_disconnect(self, _client: mqtt.Client, _userdata: Any, rc: int) -> None:
        self._log(f"mqtt disconnected rc={rc}")

    def _handle_message(self, _client: mqtt.Client, _userdata: Any, message: mqtt.MQTTMessage) -> None:
        parsed: dict[str, Any] | None = None
        try:
            decoded = message.payload.decode("utf-8")
            candidate = json.loads(decoded)
            if isinstance(candidate, dict):
                parsed = candidate
        except (UnicodeDecodeError, json.JSONDecodeError):
            parsed = None

        self._on_message(message.topic, parsed, bytes(message.payload))
