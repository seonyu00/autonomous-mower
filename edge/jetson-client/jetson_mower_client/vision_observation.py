"""팀원 비전 노드의 실험용 JSON을 해석한다. 좌표 변환과 외부 전송은 하지 않는다."""

import json
import math
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class PersonObservation:
    observation_id: str
    session_id: str
    track_id: Optional[str]
    confidence: Optional[float]
    capture_timestamp_ns: int
    timestamp_basis: str
    x_m: float
    y_m: float
    z_m: float


@dataclass(frozen=True)
class ObservationResult:
    observation_id: Optional[str]
    reason: str
    person: Optional[PersonObservation] = None


@dataclass(frozen=True)
class FrameResult:
    reason: str
    observations: tuple[ObservationResult, ...] = ()


def _object(value):
    return value if isinstance(value, dict) else {}


def _text(value):
    return isinstance(value, str) and bool(value.strip())


def _finite_number(value):
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False


def _parse(payload):
    def reject_constant(_value):
        raise ValueError("유한하지 않은 JSON 숫자")

    try:
        value = json.loads(payload, parse_constant=reject_constant)
    except (ValueError, TypeError, RecursionError):
        return None
    return value if isinstance(value, dict) else None


def parse_frame(payload: str) -> FrameResult:
    """프레임과 각 사람 관측의 실패를 분리한다. 정상도 카메라 좌표 후보일 뿐이다."""
    data = _parse(payload)
    if data is None:
        return FrameResult("invalid_json")
    if data.get("schema_version") != "0.1-experimental":
        return FrameResult("unsupported_schema")
    if data.get("status") == "metadata_incomplete":
        return FrameResult("metadata_incomplete")
    if data.get("status") != "ok":
        return FrameResult("invalid_frame")
    frame = _object(data.get("frame"))
    timestamp = frame.get("capture_timestamp_ns")
    dimensions = (frame.get("width_px"), frame.get("height_px"))
    if (not isinstance(timestamp, int) or isinstance(timestamp, bool) or timestamp <= 0
            or frame.get("timestamp_basis") != "ros_header_unverified"
            or frame.get("frame_id") != "camera_color_optical_frame"
            or any(not isinstance(v, int) or isinstance(v, bool) or v <= 0 for v in dimensions)
            or not _text(data.get("track_session_id"))
            or not isinstance(data.get("detections"), list)):
        return FrameResult("invalid_frame")
    results = []
    for item in data["detections"]:
        det = _object(item)
        if not det or not _text(det.get("class")):
            results.append(ObservationResult(None, "invalid_observation"))
            continue
        if det["class"].lower() != "person":
            continue
        observation_id = det.get("observation_id")
        session = det.get("track_session_id")
        track_id = det.get("track_id")
        confidence = det.get("confidence")
        if (not _text(observation_id) or session != data["track_session_id"]
                or (track_id is not None and not _text(track_id))
                or (confidence is not None and (not _finite_number(confidence) or not 0 <= confidence <= 1))):
            results.append(ObservationResult(None, "invalid_observation"))
            continue
        depth = _object(det.get("depth"))
        if depth.get("status") == "unavailable":
            results.append(ObservationResult(observation_id, "depth_unavailable"))
            continue
        position = _object(det.get("camera_position"))
        xyz = (position.get("x_m"), position.get("y_m"), position.get("z_m"))
        if (depth.get("status") != "valid_3d" or position.get("status") != "valid"
                or position.get("frame_id") != "camera_color_optical_frame"
                or position.get("point_type") != "bbox3d_center"
                or not all(_finite_number(v) for v in xyz) or xyz[2] <= 0):
            results.append(ObservationResult(observation_id, "invalid_camera_position"))
            continue
        results.append(ObservationResult(observation_id, "camera_position_candidate", PersonObservation(
            observation_id, session, track_id, confidence, timestamp, frame["timestamp_basis"], *xyz)))
    return FrameResult("observations" if results else "no_person", tuple(results))


def parse_status(payload: str) -> str:
    """수신한 heartbeat만 해석한다. heartbeat 미수신 판정은 별도 감시가 필요하다."""
    data = _parse(payload)
    if data is None:
        return "invalid_json"
    if data.get("schema_version") != "0.1-experimental":
        return "unsupported_schema"
    if not _text(data.get("track_session_id")):
        return "invalid_status"
    status = data.get("status")
    return status if status in ("ok", "camera_timeout", "vision_timeout") else "invalid_status"
