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

`WorkZoneEditor`는 실제 지도에서 그린 좌표가 아니라 `mockWorkZoneByRobotId`의 샘플 Polygon을 사용한다. `MapViewMap`도 샘플 경로와 읽기 전용 구역을 표시한다.

추가로 계약 불일치가 있다.

- GET 프론트 타입은 `PolygonGeometry`를 직접 기대하지만 백엔드는 metadata와 `zone`을 가진 `WorkZoneResponse`를 반환한다.
- PUT 프론트 응답 타입은 `zone`을 기대하지만 백엔드 `SaveWorkZoneResponse`에는 저장 metadata만 있다.
- 프론트 요청은 `expectedVersion`을 보내지 않는다.
- 개발 모드에서는 `zoneApi`가 실제 API 대신 항상 Mock 경로를 사용한다.

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
