CREATE TABLE robot_event (
  event_id varchar(120) PRIMARY KEY,
  robot_id varchar(50) NOT NULL REFERENCES robot(robot_id),
  severity varchar(20) NOT NULL,
  event_type varchar(80) NOT NULL,
  message varchar(500) NOT NULL,
  occurred_at timestamp NOT NULL,
  source varchar(80) NOT NULL
);

CREATE INDEX idx_robot_event_robot_occurred_at ON robot_event(robot_id, occurred_at DESC);
CREATE INDEX idx_robot_event_severity ON robot_event(severity);
