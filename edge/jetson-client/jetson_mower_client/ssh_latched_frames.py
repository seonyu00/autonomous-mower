"""r61 SSH 감독 연결의 프레임을 해석한다. 구동이나 연결 유지는 수행하지 않는다."""

import re

_PING = re.compile(rb"MOWER_PING ([0-9a-f]{32})")


def heartbeat_reply(line: bytes, *, start: bool = False) -> bytes | None:
    """완전한 ping 프레임에 대응하는 연결 확인 또는 시작 요청을 만든다."""
    match = _PING.fullmatch(line.removesuffix(b"\n"))
    if match is None:
        return None
    return match.group(1) + (b" r\n" if start else b" .\n")
