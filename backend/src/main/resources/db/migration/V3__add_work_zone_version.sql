ALTER TABLE work_zone
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN updated_at timestamp;

UPDATE work_zone
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE work_zone
  ALTER COLUMN updated_at SET NOT NULL;
