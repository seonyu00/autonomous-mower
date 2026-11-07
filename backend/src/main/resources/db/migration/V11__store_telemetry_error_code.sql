ALTER TABLE telemetry_log ADD COLUMN error_code text;
ALTER TABLE telemetry_log ADD COLUMN ingest_id uuid UNIQUE;

CREATE TABLE telemetry_error_observation (
    robot_id varchar(50) PRIMARY KEY REFERENCES robot(robot_id) ON DELETE CASCADE,
    sampled_at timestamptz NOT NULL,
    active boolean NOT NULL,
    active_session uuid
);
