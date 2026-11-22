CREATE TABLE edge_work_zone_token (
    token_id UUID PRIMARY KEY,
    robot_id VARCHAR(50) NOT NULL REFERENCES robot(robot_id),
    token_hash CHAR(64) NOT NULL UNIQUE,
    label VARCHAR(80) NOT NULL,
    created_by VARCHAR(50) NOT NULL REFERENCES admin_account(admin_id),
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_edge_work_zone_token_active ON edge_work_zone_token (robot_id, expires_at)
    WHERE revoked_at IS NULL;
