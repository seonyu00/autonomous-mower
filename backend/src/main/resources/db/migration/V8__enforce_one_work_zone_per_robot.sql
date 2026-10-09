-- 기존 중복 데이터를 임의로 삭제하지 않고 확인과 정리가 끝날 때까지 적용을 중단한다.
LOCK TABLE work_zone IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (SELECT robot_id FROM work_zone GROUP BY robot_id HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'work_zone has duplicate robot_id values; review existing zones before applying V8';
  END IF;
END $$;

ALTER TABLE work_zone
  ADD CONSTRAINT uq_work_zone_robot_id UNIQUE (robot_id);
