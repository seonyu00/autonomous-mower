-- 센서 미수신은 기본 숫자나 대기 상태 대신 NULL로 보존한다. 기존 행은 변경하지 않는다.
ALTER TABLE telemetry_log ALTER COLUMN location_point DROP NOT NULL;
ALTER TABLE telemetry_log ALTER COLUMN battery_level DROP NOT NULL;
ALTER TABLE telemetry_log ALTER COLUMN robot_state DROP NOT NULL;
