CREATE TABLE robot_snapshot (
  snapshot_id varchar(120) PRIMARY KEY,
  robot_id varchar(50) NOT NULL REFERENCES robot(robot_id),
  capture_type varchar(20) NOT NULL,
  captured_at timestamp NOT NULL,
  content_type varchar(80) NOT NULL,
  file_size bigint NOT NULL,
  relative_path varchar(500) NOT NULL UNIQUE,
  created_at timestamp NOT NULL
);

ALTER TABLE robot_event
  ADD COLUMN snapshot_id varchar(120) REFERENCES robot_snapshot(snapshot_id);

CREATE INDEX idx_robot_snapshot_robot_captured_at
  ON robot_snapshot(robot_id, captured_at DESC);
CREATE INDEX idx_robot_event_snapshot_id
  ON robot_event(snapshot_id)
  WHERE snapshot_id IS NOT NULL;
