# 작업 구역과 PostGIS

작업 구역(Work Zone)은 로봇이 작업할 수 있는 범위를 WGS84 좌표계의 Polygon으로 저장한다.

## 처리 순서

```text
React Map
  -> PUT /api/robots/<ROBOT_ID>/work-zone
  -> WorkZoneController
  -> WorkZoneService
  -> GeoJsonPolygonMapper
  -> PostGIS geometry(Polygon, 4326)
```

## 요청 예제

```json
{
  "expectedVersion": 1,
  "zone": {
    "type": "Polygon",
    "srid": 4326,
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [127.0000, 37.0000],
          [127.0002, 37.0000],
          [127.0002, 37.0002],
          [127.0000, 37.0000]
        ]
      ]
    }
  }
}
```

`expectedVersion`은 다른 사용자가 먼저 수정한 작업 구역을 덮어쓰지 않기 위한 낙관적 잠금 값이다.

## 현재 구현 상태

- 백엔드는 Polygon 검증, SRID 4326 저장, version 증가를 지원한다.
- PostGIS에서 유효 Polygon으로 저장되는 것을 로컬 실험으로 확인했다.
- 프론트엔드 편집기는 샘플 Polygon을 보여주는 단계이며 실제 지도 편집·저장과 연결되지 않았다.
- 프론트엔드와 백엔드의 응답 타입 및 `expectedVersion` 사용이 일치하지 않는다.
- 작업 구역을 벗어나면 로봇을 정지시키는 안전 제어는 구현되지 않았다.
