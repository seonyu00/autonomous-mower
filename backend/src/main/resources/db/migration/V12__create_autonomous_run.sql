CREATE TABLE autonomous_run (
    id uuid PRIMARY KEY,
    robot_id varchar(50) NOT NULL REFERENCES robot(robot_id),
    started_at timestamptz NOT NULL,
    last_signal_at timestamptz NOT NULL,
    last_observed_at timestamptz NOT NULL,
    ended_at timestamptz,
    version bigint NOT NULL DEFAULT 0
);
CREATE INDEX idx_autonomous_run_robot_start ON autonomous_run(robot_id, started_at);
CREATE TABLE autonomous_run_position (
    run_id uuid NOT NULL REFERENCES autonomous_run(id),
    measured_at timestamptz NOT NULL,
    latitude double precision,
    longitude double precision,
    PRIMARY KEY (run_id, measured_at),
    CHECK ((latitude IS NULL AND longitude IS NULL) OR
        (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
);
