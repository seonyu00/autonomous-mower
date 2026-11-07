-- 웹에서 확인한 경로를 다시 계산하지 않고 전달하기 위한 불변 보관본이다.
CREATE TABLE route_plan (
    plan_id UUID PRIMARY KEY,
    robot_id VARCHAR(50) NOT NULL,
    zone_id BIGINT NOT NULL,
    zone_version INTEGER NOT NULL,
    payload TEXT NOT NULL,
    sha256 VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
