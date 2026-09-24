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
- 저장된 Polygon은 `기존 구역 수정`으로 꼭짓점을 그대로 불러올 수 있다.
- 편집 중 꼭짓점을 드래그하면 해당 좌표만 변경된다.
- `편집 취소`를 누르면 저장된 Polygon 표시로 돌아간다.

Mock 여부는 `VITE_ENABLE_MOCK_WORK_ZONE`으로 결정한다.

```text
VITE_ENABLE_MOCK_WORK_ZONE=true   # 샘플 조회·가상 저장
VITE_ENABLE_MOCK_WORK_ZONE=false  # 백엔드 GET/PUT와 PostGIS 사용
```

이 설정은 운용자 화면에서 변경하지 않는다. 실제 모드에서는 샘플 Polygon을 실수로 저장하지 않도록 `샘플 구역 불러오기` 액션도 표시하지 않는다.

## 7. 실제 저장 통합 검증

2026년 6월 15일 로컬 Spring Boot와 PostGIS 환경에서 `MOWER-01` 작업 구역을 검증했다.

- 작업 구역이 없는 상태에서 최초 PUT 저장이 성공했고 version 1이 반환됐다.
- GET으로 같은 Polygon, SRID 4326과 꼭짓점 5개를 다시 조회했다.
- 좌표를 수정해 version 1을 `expectedVersion`으로 전달하자 version 2로 저장됐다.
- version 2 저장 이후 오래된 version 1로 다시 PUT하자 HTTP 400으로 거부됐다.
- PostGIS에서 `ST_IsValid(zone_polygon)` 결과가 true임을 확인했다.

## 8. 안전상 한계

`WorkZone.isPointInside()`는 존재하지만 현재 주행 명령이나 telemetry 처리와 연결되지 않았다. 로봇이 Polygon 밖으로 나가도 자동 정지하지 않는다. 따라서 작업 구역 저장 기능과 경계 안전 기능은 별개다.

## 9. 권장 파일 읽기 순서

1. `frontend/src/features/map/components/WorkZoneEditor.tsx`
2. `frontend/src/features/map/zoneApi.ts`
3. `frontend/src/features/map/geojson.ts`
4. `backend/src/main/java/com/autonomousmower/workzone/controller/WorkZoneController.java`
5. `backend/src/main/java/com/autonomousmower/workzone/service/WorkZoneService.java`
6. `backend/src/main/java/com/autonomousmower/workzone/service/GeoJsonPolygonMapper.java`
7. `backend/src/main/java/com/autonomousmower/workzone/entity/WorkZone.java`

## CPP 예정 경로 미리보기

2026-09-23 추가. `MapViewMap`의 생성 버튼 → `useCppPreview` → `POST /api/robots/{robotId}/work-zone/cpp-preview` → `CppPreviewService` → 기존 `WorkZoneService.getWorkZone` → `CppProcessRunner` → 반입한 C++ `cpp_map_cli` 순서로 실행한다. 알고리즘은 C++만 사용한다. DB·기존 저장 계약은 바꾸지 않았다.

서버는 조회된 저장본 버전과 요청 버전을 비교하고 CLI 종료 후 다시 조회한다. 응답에는 해당 robotId·zoneId·version을 포함한다. 셸 없이 서버가 지정한 절대 경로를 실행하고 JSON은 표준 입력으로 전달한다. 입력 격자 상한, 동시 실행 제한, 비동기 입출력, 시간 초과 및 출력 크기 초과 시 프로세스 종료를 적용했다. 자세한 수치와 오류는 [API 계약](../api-contract.md)의 cpp-preview 절을 따른다.

웹은 로봇 변경, 저장 구역 객체·버전 갱신, 편집 시작/종료, 세션 변경과 컴포넌트 해제 시 요청을 취소하고 요청 세대 번호를 바꾼다. 취소 후 늦게 도착한 응답과 이전 요청의 성공·실패는 표시하지 않는다. 웹 요청은 응답 본문 처리까지 15초로 제한하며 초과 시 생성 중 상태를 해제하고 재시도를 안내한다. 성공·구역 변경·해제 시 타이머도 정리한다. 웹의 요청 취소가 서버 DB 작업의 중단을 의미하지는 않는다. 다른 사용자의 저장 자체를 웹에 실시간 통지하지는 않으므로 최신 구역은 재조회해야 한다.

네이버 지도에는 전체 경로선과 시작·끝·진행 화살표를 표시한다. 긴 경로의 표식은 약 24개로 간추리며 번호는 원래 경로점 순서다. 결과 생성 시 전체 경로 범위로 화면을 맞춘다. 미리보기 경로가 있는 동안에는 위치 마커만 갱신하고 로봇 위치로 자동 이동하지 않는다. 경로가 제거되면 기존 자동 추적을 재개한다. SDK를 사용할 수 없으면 저장 구역 좌표 도식에 같은 경로를 표시한다. 패널 제목을 눌러 접으면 가려진 선을 확인할 수 있다. 도식은 실제 배경 지도나 주행 허가가 아니다.

### 실행과 확인

1. [CPP README](../../edge/mower-navigation/README.md#웹-미리보기용-실행-파일)에 따라 CLI를 빌드하고 백엔드 환경변수 `CPP_EXECUTABLE`에 절대 경로를 지정한다. 기존 Java 21·DB·JWT 설정을 사용하며 MQTT를 켤 필요가 없다.
2. 프런트엔드에서 `VITE_ENABLE_MOCK_WORK_ZONE=false`로 `npm run dev`를 실행한다. 작업 지도를 열고 기존 저장 구역을 조회하거나 정상 지도에서 저장한다. 샘플 구역 모드에서는 CPP 생성이 비활성화된다.
3. 편집을 마치고 격자 간격(기본 1m)을 선택해 `예정 경로 생성`을 누른다. 생성 중·실패·빈 결과 문구와 시작·끝·번호를 확인한다. 격자 간격은 실제 예초기 폭을 의미하지 않는다. 구역의 남북 높이 또는 위도 보정된 동서 폭보다 큰 격자는 CLI 실행 전에 422 `CPP_GRID_TOO_LARGE`로 거부하며 격자 간격을 줄이도록 안내한다.
4. 로봇 변경 또는 구역 편집/저장/재조회로 이전 결과가 제거되는지 확인한다. 새로운 결과는 생성 버튼을 다시 눌러 요청한다.

### 검증 범위

이번 PC 검증은 C++ 테스트 2개와 CLI 정밀도 테스트, Java 실제 CLI 연결 테스트(구역 조회는 Mock), 프로세스 실패·시간 초과·출력량·동시 실행 제한, API 인증·권한·입력 검증, 프런트 좌표 변환·오래된 응답 제거·네이버 SDK 대역 및 대체 지도 렌더링을 포함한다. 실행 수치와 결과는 [개발 로그](../development-log.md)의 같은 날짜 기록을 따른다.

로컬 브라우저에서는 실제 C++ 출력 130점과 테스트 대역 저장 구역·HTTP 응답으로 생성 중 상태, 시작·끝·번호·방향, 패널 접기 및 구역 변경 후 제거를 확인했다. 실제 PostgreSQL 저장→HTTP→네이버 배경 지도 전체 연결, 네이버 실 SDK, Jetson·ROS·MQTT·STM32·실기체 주행은 이번에 검증하지 않았다. 경계 밖 격자점을 제외하는 원본 특성만으로 경로 연결의 경계 내 포함이나 장애물 우회, 기체 폭·회전 반경·커버리지 충족을 보장하지 않는다.
