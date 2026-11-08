-- 작업 구역과 이동 가능 범위는 같은 버전으로 교체를 감지한다.
ALTER TABLE work_zone ADD COLUMN travel_polygon geometry(Polygon,4326);
