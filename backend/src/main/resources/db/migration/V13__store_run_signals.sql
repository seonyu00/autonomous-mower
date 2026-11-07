CREATE TABLE stored_run_signal (
 id uuid PRIMARY KEY,
 run_id uuid NOT NULL,
 robot_id varchar(50) NOT NULL REFERENCES robot(robot_id),
 observed_at timestamptz NOT NULL,
 payload text NOT NULL,
 conflict boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_run_signal_run ON stored_run_signal(run_id, observed_at);
CREATE INDEX idx_run_signal_robot ON stored_run_signal(robot_id, observed_at);
