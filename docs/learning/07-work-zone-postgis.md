# 작업 구역과 PostGIS 코드 흐름

## 1. 이 기능이 하는 일

작업 구역(Work Zone)은 로봇이 작업할 범위를 WGS84 좌표계의 Polygon으로 저장한다. 백엔드는 GeoJSON 형태의 좌표를 JTS `Polygon`으로 바꾸고 PostGIS `geometry(Polygon, 4326)` 컬럼에 저장한다.

## 2. 의도된 전체 시퀀스

```text
WorkZoneEditor
  -> validatePolygonGeometry()
  -> toPostGisPolygonPayload()
  -> zoneApi.saveWorkZone()
  -> PUT /api/robots/<ROBOT_ID>/work-zone
  -> WorkZoneController.saveWorkZone()
  -> WorkZoneService.saveWorkZone()
     -> RobotRepository.findById()
     -> GeoJsonPolygonMapper.toPolygon()
     -> WorkZoneRepository.findFirstByRobotRobotId()
     -> version 검사
     -> WorkZoneRepository.save()
  -> PostGIS work_zone
```

## 3. 백엔드 검증

`GeoJsonPolygonMapper`는 다음을 검사한다.

- payload와 geometry type이 모두 `Polygon`인지
- SRID가 4326인지
- ring이 존재하는지
- 각 ring의 시작점과 끝점이 같은지
- 최소 좌표 개수를 만족하는지
- JTS가 만든 Polygon이 valid인지

기존 구역을 수정할 때 `expectedVersion`이 현재 version과 다르면 저장을 거부한다. 성공하면 entity version이 증가한다.

## 4. 공개용 요청 예제

```json
{
  "expectedVersion": 1,
  "zone": {
    "type": "Polygon",
    "srid": 4326,
    "geometry": {
      "type": "Polygon",
      "coordinates": [[
        [127.0000, 37.0000],
        [127.0002, 37.0000],
        [127.0002, 37.0002],
        [127.0000, 37.0000]
      ]]
    }
  }
}
```

## 5. 실제 검증에서 확인한 내용

- 유효 Polygon 저장 시 version 1이 반환됐다.
- GET 결과의 SRID가 4326이었다.
- 수정 후 version이 2로 증가했다.
- 오래된 `expectedVersion` 요청은 HTTP 400으로 거부됐다.
- PostGIS `ST_IsValid` 결과는 true였다.
- 테스트 Polygon 면적은 약 1,570.24㎡로 계산됐다.
- 실험 데이터는 확인 후 삭제했다.

## 6. 프론트엔드의 현재 상태

`WorkZoneEditor`에서 지도 클릭으로 꼭짓점을 추가하고 Polygon을 저장할 수 있다. `zoneApi`는 백엔드의 조회·저장 계약에 맞춰 metadata와 geometry를 분리해 처리한다.

- GET 응답의 `zone.geometry`를 지도 표시용 Polygon으로 변환한다.
- GET 응답의 `version`을 로봇별 store에 보관한다.
- PUT 요청에 현재 version을 `expectedVersion`으로 전달한다.
- PUT 성공 응답의 새 version을 store에 반영한다.
- 작업 구역이 없는 404 응답은 빈 작업 구역으로 처리한다.
- 조회 실패 시 연결 상태 안내를 표시한다.
- 저장 실패 시 편집 중인 꼭짓점을 유지한다.

Mock 여부는 `VITE_ENABLE_MOCK_WORK_ZONE`으로 결정한다.

```text
VITE_ENABLE_MOCK_WORK_ZONE=true   # 샘플 조회·가상 저장
VITE_ENABLE_MOCK_WORK_ZONE=false  # 백엔드 GET/PUT와 PostGIS 사용
```

이 설정은 운용자 화면에서 변경하지 않는다. 실제 모드에서는 샘플 Polygon을 실수로 저장하지 않도록 `샘플 구역 불러오기` 액션도 표시하지 않는다.

## 7. 안전상 한계

`WorkZone.isPointInside()`는 존재하지만 현재 주행 명령이나 telemetry 처리와 연결되지 않았다. 로봇이 Polygon 밖으로 나가도 자동 정지하지 않는다. 따라서 작업 구역 저장 기능과 경계 안전 기능은 별개다.

## 8. 권장 파일 읽기 순서

1. `frontend/src/features/map/components/WorkZoneEditor.tsx`
2. `frontend/src/features/map/zoneApi.ts`
3. `frontend/src/features/map/geojson.ts`
4. `backend/src/main/java/com/autonomousmower/workzone/controller/WorkZoneController.java`
5. `backend/src/main/java/com/autonomousmower/workzone/service/WorkZoneService.java`
6. `backend/src/main/java/com/autonomousmower/workzone/service/GeoJsonPolygonMapper.java`
7. `backend/src/main/java/com/autonomousmower/workzone/entity/WorkZone.java`
