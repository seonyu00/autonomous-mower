import copy
import json
import unittest

from jetson_mower_client.vision_observation import parse_frame, parse_status


def frame():
    return {
        "schema_version": "0.1-experimental", "status": "ok", "track_session_id": "session",
        "frame": {"frame_id": "camera_color_optical_frame", "capture_timestamp_ns": 123456789,
                  "timestamp_basis": "ros_header_unverified", "width_px": 640, "height_px": 480},
        "detections": [{"observation_id": "observation", "track_session_id": "session", "track_id": "7",
                        "class": "person", "confidence": 0.87,
                        "depth": {"status": "valid_3d", "capture_timestamp_ns": None,
                                  "rgb_depth_gap_ms": None, "valid_pixel_ratio": None},
                        "camera_position": {"status": "valid", "frame_id": "camera_color_optical_frame",
                                            "point_type": "bbox3d_center", "x_m": 0.12, "y_m": 0.08, "z_m": 2.15},
                        "map_observation": None}],
    }


class VisionObservationTests(unittest.TestCase):
    def test_person_is_only_a_camera_position_candidate(self):
        result = parse_frame(json.dumps(frame()))
        self.assertEqual(result.reason, "observations")
        observation = result.observations[0]
        self.assertEqual(observation.reason, "camera_position_candidate")
        self.assertEqual(observation.person.timestamp_basis, "ros_header_unverified")
        self.assertEqual(observation.person.z_m, 2.15)
        self.assertFalse(hasattr(observation.person, "latitude"))

    def test_missing_depth_and_invalid_position_remain_distinct(self):
        data = frame()
        unavailable = copy.deepcopy(data["detections"][0])
        unavailable["observation_id"] = "no-depth"
        unavailable["depth"]["status"] = "unavailable"
        unavailable["camera_position"] = None
        invalid = copy.deepcopy(data["detections"][0])
        invalid["observation_id"] = "wrong-frame"
        invalid["camera_position"]["frame_id"] = "base_link"
        data["detections"].extend([unavailable, invalid])
        result = parse_frame(json.dumps(data))
        self.assertEqual([o.reason for o in result.observations],
                         ["camera_position_candidate", "depth_unavailable", "invalid_camera_position"])
        self.assertIsNone(result.observations[1].person)

    def test_empty_detections_are_not_camera_failure(self):
        data = frame()
        data["detections"] = []
        self.assertEqual(parse_frame(json.dumps(data)).reason, "no_person")
        data["detections"] = [{"class": "tree"}]
        self.assertEqual(parse_frame(json.dumps(data)).reason, "no_person")

    def test_metadata_schema_and_malformed_input_fail_closed(self):
        data = frame()
        data["status"] = "metadata_incomplete"
        self.assertEqual(parse_frame(json.dumps(data)).reason, "metadata_incomplete")
        data = frame()
        data["schema_version"] = "1.0"
        self.assertEqual(parse_frame(json.dumps(data)).reason, "unsupported_schema")
        self.assertEqual(parse_frame("{").reason, "invalid_json")
        self.assertEqual(parse_frame('{"value": NaN}').reason, "invalid_json")
        data = frame()
        data["frame"]["capture_timestamp_ns"] = 0
        self.assertEqual(parse_frame(json.dumps(data)).reason, "invalid_frame")

    def test_bad_session_and_numeric_values_are_rejected(self):
        for change in ("session", "boolean", "negative", "huge"):
            data = frame()
            det = data["detections"][0]
            if change == "session": det["track_session_id"] = "other"
            if change == "boolean": det["camera_position"]["x_m"] = True
            if change == "negative": det["camera_position"]["z_m"] = -1
            if change == "huge": det["camera_position"]["z_m"] = 10 ** 400
            result = parse_frame(json.dumps(data)).observations[0]
            self.assertIsNone(result.person, change)

    def test_heartbeat_status_is_separate_from_frames(self):
        for status in ("ok", "camera_timeout", "vision_timeout"):
            data = {"schema_version": "0.1-experimental", "track_session_id": "s", "status": status}
            self.assertEqual(parse_status(json.dumps(data)), status)
        data["status"] = "other"
        self.assertEqual(parse_status(json.dumps(data)), "invalid_status")
        self.assertEqual(parse_status("null"), "invalid_json")


if __name__ == "__main__":
    unittest.main()
