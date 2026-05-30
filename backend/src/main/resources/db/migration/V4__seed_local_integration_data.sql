INSERT INTO admin_account (admin_id, password_hash, role, created_at)
VALUES (
  'admin',
  '$2a$10$M7onyWjkMz/lEMiz.BhLR.kO0fF9O2Bvx27Gl1gIxtGE8SW89GRai',
  'admin',
  CURRENT_TIMESTAMP
)
ON CONFLICT (admin_id) DO NOTHING;

INSERT INTO robot (robot_id, model_name, enabled, created_at)
VALUES ('MOWER-01', 'Jetson Orin Local Integration Mock', true, CURRENT_TIMESTAMP)
ON CONFLICT (robot_id) DO NOTHING;
