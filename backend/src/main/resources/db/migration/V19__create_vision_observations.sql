CREATE TABLE vision_observation (
    id BIGSERIAL PRIMARY KEY,
    robot_id VARCHAR(50) NOT NULL REFERENCES robot(robot_id),
    observation_id VARCHAR(128) NOT NULL,
    zone_version INTEGER NOT NULL,
    observed_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    state VARCHAR(24) CHECK (state IN ('MOW_NOW','DANGEROUS','DEFERRED_MOWABLE','NOT_MOWABLE','UNKNOWN')),
    source VARCHAR(128),
    fingerprint VARCHAR(64) NOT NULL,
    current_geometry geometry(Geometry,4326),
    danger_geometry geometry(Geometry,4326),
    UNIQUE (robot_id, observation_id)
);
CREATE INDEX ix_vision_current ON vision_observation(robot_id,zone_version) WHERE current_geometry IS NOT NULL;
CREATE INDEX ix_vision_danger ON vision_observation(robot_id,received_at,id) WHERE danger_geometry IS NOT NULL;
