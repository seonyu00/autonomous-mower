-- 실제 센서 입력은 별도 연결하며 기존 작업에 최신 구역을 자동 배정하지 않는다.
CREATE TABLE run_mowing_context (
    run_id UUID PRIMARY KEY REFERENCES autonomous_run(id),
    plan_id UUID NOT NULL REFERENCES route_plan(plan_id)
);
CREATE TABLE blade_observation (
    id UUID PRIMARY KEY,
    run_id UUID NOT NULL REFERENCES autonomous_run(id),
    robot_id VARCHAR(50) NOT NULL,
    measured_at TIMESTAMPTZ NOT NULL,
    state VARCHAR(16) NOT NULL CHECK (state IN ('ON', 'OFF', 'UNKNOWN')),
    evidence VARCHAR(16) NOT NULL CHECK (evidence IN ('ROTATION', 'POWER', 'UNKNOWN'))
);
CREATE INDEX blade_observation_run_time ON blade_observation(run_id, measured_at);
