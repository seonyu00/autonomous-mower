INSERT INTO robot (robot_id, model_name, enabled, created_at)
VALUES ('MOWER-01', 'Jetson Orin Local Integration Mock', true, CURRENT_TIMESTAMP)
ON CONFLICT (robot_id) DO NOTHING;
