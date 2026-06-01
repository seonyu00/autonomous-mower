from __future__ import annotations

from collections.abc import Callable
from typing import Any


EMERGENCY_MODE_VALUE = 2


def make_zero_twist(twist_factory: Callable[[], Any]) -> Any:
    message = twist_factory()
    message.linear.x = 0.0
    message.linear.y = 0.0
    message.linear.z = 0.0
    message.angular.x = 0.0
    message.angular.y = 0.0
    message.angular.z = 0.0
    return message


def publish_emergency_stop_outputs(
    cmd_vel_publisher: Any,
    set_mode_publisher: Any,
    engine_publisher: Any,
    twist_factory: Callable[[], Any],
    int8_factory: Callable[[], Any],
    bool_factory: Callable[[], Any],
    emergency_mode_value: int = EMERGENCY_MODE_VALUE,
) -> None:
    zero_twist = make_zero_twist(twist_factory)
    cmd_vel_publisher.publish(zero_twist)

    mode = int8_factory()
    mode.data = emergency_mode_value
    set_mode_publisher.publish(mode)

    engine = bool_factory()
    engine.data = False
    engine_publisher.publish(engine)

