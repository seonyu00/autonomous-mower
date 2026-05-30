CREATE TABLE command_execution (
  command_id varchar(120) PRIMARY KEY,
  robot_id varchar(50) NOT NULL REFERENCES robot(robot_id),
  command_type varchar(80) NOT NULL,
  idempotency_key varchar(160),
  requested_by varchar(80) NOT NULL,
  status varchar(40) NOT NULL,
  requested_at timestamp with time zone NOT NULL,
  sent_at timestamp with time zone NOT NULL,
  edge_received_at timestamp with time zone,
  acked_at timestamp with time zone,
  completed_at timestamp with time zone,
  failed_at timestamp with time zone,
  timeout_at timestamp with time zone,
  edge_node_id varchar(160),
  reason varchar(500)
);

CREATE INDEX idx_command_execution_robot_sent_at ON command_execution(robot_id, sent_at DESC);
CREATE INDEX idx_command_execution_idempotency ON command_execution(robot_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_command_execution_status_sent_at ON command_execution(status, sent_at);
