ALTER TABLE autonomous_run_position ADD COLUMN position_index integer;

-- 기존 경로를 보존하면서 작업별 위치 순번을 채운다.
WITH ordered_positions AS (
    SELECT run_id, measured_at,
        (row_number() OVER (PARTITION BY run_id ORDER BY measured_at) - 1)::integer AS position_index
    FROM autonomous_run_position
)
UPDATE autonomous_run_position AS position
SET position_index = ordered.position_index
FROM ordered_positions AS ordered
WHERE position.run_id = ordered.run_id AND position.measured_at = ordered.measured_at;

ALTER TABLE autonomous_run_position ALTER COLUMN position_index SET NOT NULL;
