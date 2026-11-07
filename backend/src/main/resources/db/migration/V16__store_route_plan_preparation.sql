-- 준비 프로그램의 보고 수신 기록이며 장비 신원이나 주행 준비를 보증하지 않는다.
CREATE TABLE route_plan_preparation (
    plan_id UUID PRIMARY KEY REFERENCES route_plan(plan_id),
    sha256 VARCHAR(64) NOT NULL,
    reported_by VARCHAR(128) NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
