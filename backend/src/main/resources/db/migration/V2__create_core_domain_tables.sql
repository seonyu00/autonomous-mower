CREATE TABLE admin_account (
  admin_id varchar(50) PRIMARY KEY,
  password_hash varchar(255) NOT NULL,
  role varchar(20) NOT NULL,
  created_at timestamp NOT NULL
);

CREATE TABLE robot (
  robot_id varchar(50) PRIMARY KEY,
  model_name varchar(120) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL
);

CREATE TABLE work_zone (
  zone_id bigserial PRIMARY KEY,
  robot_id varchar(50) NOT NULL REFERENCES robot(robot_id),
  zone_polygon geometry(Polygon, 4326) NOT NULL,
  created_at timestamp NOT NULL
);

CREATE TABLE telemetry_log (
  log_id bigserial PRIMARY KEY,
  robot_id varchar(50) NOT NULL REFERENCES robot(robot_id),
  location_point geometry(Point, 4326) NOT NULL,
  battery_level integer NOT NULL,
  robot_state varchar(20) NOT NULL,
  recorded_at timestamp NOT NULL
);

CREATE INDEX idx_work_zone_robot_id ON work_zone(robot_id);
CREATE INDEX idx_work_zone_polygon_gist ON work_zone USING gist(zone_polygon);
CREATE INDEX idx_telemetry_log_robot_recorded_at ON telemetry_log(robot_id, recorded_at DESC);
CREATE INDEX idx_telemetry_log_location_gist ON telemetry_log USING gist(location_point);
