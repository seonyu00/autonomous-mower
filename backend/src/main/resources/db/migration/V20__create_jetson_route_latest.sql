CREATE TABLE jetson_route_latest (
    robot_id VARCHAR(50) PRIMARY KEY REFERENCES robot(robot_id),
    zone_id BIGINT NOT NULL,
    zone_version INTEGER NOT NULL,
    generation BIGINT NOT NULL CHECK (generation > 0),
    session_id UUID NOT NULL,
    reported_by VARCHAR(100) NOT NULL,
    report_payload TEXT,
    received_at TIMESTAMPTZ
);
