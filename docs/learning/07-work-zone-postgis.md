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
     -> WorkZoneRepository.findByRobotRobotId()
     -> version 검사
     -> WorkZoneRepository.saveAndFlush()
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

기존 구역을 수정할 때 `expectedVersion`이 없거나 현재 version과 다르면 HTTP 409 `WORK_ZONE_CONFLICT`로 거부한다. 최초 생성만 null 버전을 사용한다. JPA `@Version`이 DB UPDATE 조건에 이전 버전을 포함하므로 같은 버전의 동시 수정 중 하나만 성공하며, flush 후 증가한 version을 응답한다. 최초 생성 경쟁은 robot_id 고유 제약으로 제한한다. 아래 5절의 HTTP 400은 과거 검증 기록이며 이 변경의 실행 결과가 아니다.

### 기존 DB 마이그레이션과 검증 범위

SRS 7.3에는 로봇당 활성 구역 1개가 명시돼 있다. 현재 모델에는 활성·비활성 구분이 없어 V8은 `uq_work_zone_robot_id` 제약을 추가한다. 기존 V2·V3 파일이나 저장된 version·Polygon은 변경하지 않는다.

### V9 이후 V8을 추가하는 DB의 적용 순서 — 2026-10-06

V9가 적용됐지만 V8이 없는 DB에 이번 V8 파일을 추가하면 기본 Flyway 설정에서 `resolved migration not applied ... 8` 검증 오류로 서버가 시작하지 않는다. 새 DB의 V1~V9 순차 적용에는 이 문제가 없다. 적용된 V8·V9 파일의 이름·내용·체크섬을 변경하거나 이력 행을 삭제하지 않는다.

1. DB 백업과 작업 구역 쓰기 중단을 준비한다. `flyway_schema_history`에서 V9 적용 여부와 V8 누락을 확인하고, 위 중복 조회 SQL을 실행한다. 중복 구역이 있거나 V8 외의 누락·체크섬 오류가 있으면 아래 절차로 넘어가지 않는다.
2. V8만 누락되고 중복이 없는 경우에 한해 적용용 서버 프로세스에서 `SPRING_FLYWAY_OUT_OF_ORDER=true`를 일회성으로 지정한다. 자동 설정이나 영구 환경 파일에는 추가하지 않는다. 이는 이미 적용된 V9를 수정하지 않고 원본 V8을 뒤늦게 적용하기 위한 절차다.
3. V8 성공과 `uq_work_zone_robot_id` 생성을 확인한다. 기존 zone_id·version·Polygon·시각 값이 보존됐는지 확인한다. 실패한 중복 검사에서 데이터를 자동 삭제하거나 Flyway repair로 실패 원인을 숨기지 않는다.
4. 적용용 프로세스를 종료하고 위 환경변수를 제거한 기본 설정으로 다시 시작한다. Flyway validate·migrate가 통과하고 추가 적용이 없는지 확인한다. 배포 DB의 실제 잠금 대기 시간과 업무 중단 시간은 별도로 평가해야 한다.

`WorkZoneMigrationOrderTest`는 loopback의 별도 `mower_workzone_test` DB에 UUID 스키마를 만들어 V1~V7·V9를 먼저 적용한다. 기본 설정 실패 → 일회성 outOfOrder 적용 → 기본 설정 validate·migrate 성공, 기존 version=4 구역의 전체 행 보존, 계정 관리 잠금 테이블 보존을 검사한다. 중복 2행이면 V8 적용이 중단되고 데이터·Flyway 이력·고유 제약이 부분 적용되지 않는지도 검사한다. 테스트는 자신이 만든 스키마만 제거한다.

2026-10-06 전용 PostgreSQL/PostGIS에서 위 2개와 `WorkZoneConcurrencyTest` 2개가 skip 없이 통과했다. 실제 HTTP 동시 최초 생성·수정도 각각 성공 한 건/409 한 건이었고, null 버전으로 기존 구역을 덮지 않았으며 DB 구역은 한 행이었다. HTTP 검사 재실행 조건은 [Edge 검증 도구](../../tools/edge-mock-client/README.md#제어ack구역-저장-통합-검증)를 따른다. 테스트 실행 환경은 [개발 로그](../development-log.md)에 기록했다.

### V8 적용 기본 검사와 과거 검증

- 사전 확인 SQL: `SELECT robot_id, COUNT(*) FROM work_zone GROUP BY robot_id HAVING COUNT(*) > 1;`
- 중복이 있으면 V8이 예외로 중단된다. 기존 구역을 임의로 선택하거나 삭제하지 않는다. 백업 후 보존할 구역과 이력 보관 방법을 확인하고 데이터를 정리한 뒤 적용해야 한다.
- 마이그레이션은 ACCESS EXCLUSIVE 잠금과 고유 인덱스 생성이 필요해 적용 중 읽기·쓰기가 대기할 수 있다. 실제 데이터 양·잠금 대기 시간·중복 여부는 아직 확인하지 않았다. Flyway 트랜잭션으로 적용하며 실패 시 제약을 부분 적용하지 않는다.
- 7-1에서 보류했던 검증을 7-2와 함께 실행했다. 관련 프론트 36개, 백엔드 Mock·컨트롤러·엔티티·Polygon 테스트 20개와 운영 빌드·TypeScript·ESLint·bootJar가 통과했다. `WorkZoneServiceTest`는 Mock 예외 변환만 검사하며 DB 경쟁 성공을 증명하지 않는다.
- `WorkZoneConcurrencyTest`는 두 실제 트랜잭션을 같은 조회 버전에서 만나게 한 뒤 수정·최초 생성 경쟁의 성공 한 건/실패 한 건을 검사한다. 2026-09-12 실행에서는 환경 조건 미충족으로 2개가 skip됐다. Docker 엔진 연결이 불가능하고 로컬 PostgreSQL 실행 도구도 확인되지 않아 실제 DB 검증과 V8 적용은 수행하지 않았다. 새 로컬 전용 PostgreSQL/PostGIS DB `mower_workzone_test`를 준비하고 `WORK_ZONE_TEST_JDBC_URL=jdbc:postgresql://localhost:<port>/mower_workzone_test`, `WORK_ZONE_TEST_DB_USER`, `WORK_ZONE_TEST_DB_PASSWORD`를 명시해야 한다. skip을 통과로 보고하지 않는다. 테스트 DB에는 전체 Flyway 마이그레이션·seed가 적용되므로 기존 업무 DB를 지정하지 않는다.

2026-09-15에는 Docker 내부 런타임 소켓 폴더를 보존한 뒤 재시작해 엔진을 복구하고, 기존 프로젝트 서비스와 분리한 `postgis/postgis:16-3.4`에서 위 테스트 2개를 실행했다. 결과 XML은 tests=2, skipped=0, failures=0, errors=0이었다. 동일 버전 수정 경쟁과 최초 생성 경쟁 모두 성공 한 건/실패 한 건을 확인했으며 테스트 로봇은 정리됐다. Flyway V1~V8도 전부 적용됐다. 이는 Repository 실제 트랜잭션 검증이며 HTTP 409 변환은 앞서 수행한 Mock·컨트롤러 검증과 구분한다.

같은 격리 컨테이너의 별도 DB `mower_migration_check`에 V1~V7과 version=4 구역을 준비해 V8을 트랜잭션으로 적용했다. 적용 전후 행 차이가 0이며 고유 제약이 생성됐다. 이후 해당 테스트 DB에서만 제약을 제거하고 중복 구역을 넣어 재적용했을 때 의도한 오류로 중단됐고, 중복 2행은 보존되며 부분 적용된 고유 제약은 없었다. 운영 DB 데이터·잠금 대기 시간은 검증하지 않았다.

로컬 재실행은 준비된 컨테이너 `mower-workzone-test-20260915`와 `127.0.0.1:55432`를 사용한다. 종료돼 있다면 `docker start mower-workzone-test-20260915`로 시작한다. 아래 명령은 저장소의 `backend` 폴더에서 실행한다. 비밀번호는 전용 컨테이너 설정에서 프로세스 환경변수로 읽고 출력하지 않는다. 기존 업무 DB로 대체하지 않는다.

```powershell
$testContainer = docker inspect mower-workzone-test-20260915 | ConvertFrom-Json
$env:WORK_ZONE_TEST_DB_PASSWORD = ($testContainer.Config.Env | Where-Object { $_ -like 'POSTGRES_PASSWORD=*' }).Substring(18)
$env:WORK_ZONE_TEST_DB_USER = 'mower_test'
$env:WORK_ZONE_TEST_JDBC_URL = 'jdbc:postgresql://localhost:55432/mower_workzone_test'
try {
    .\gradlew.bat --offline test --tests '*WorkZoneConcurrencyTest' --rerun-tasks --console=plain
} finally {
    Remove-Item Env:WORK_ZONE_TEST_DB_PASSWORD, Env:WORK_ZONE_TEST_DB_USER, Env:WORK_ZONE_TEST_JDBC_URL
}
```

환경변수 변경만으로 Gradle이 테스트를 다시 실행한다고 가정하지 않고 `--rerun-tasks`를 사용한다. 테스트 후 XML의 skipped 수까지 확인한다. 사용 후에는 `docker stop mower-workzone-test-20260915`로 종료할 수 있다. 이번 복구는 현재 기동 성공을 확인한 것이며 Windows 재부팅 후 재발 여부는 확인하지 않았다.

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
- 409 충돌 시 저장을 막고 `최신 구역 다시 불러오기`를 안내한다. 사용자가 재조회하면 최신 저장본·버전만 갱신하고 편집 꼭짓점은 유지한다.
- 저장된 Polygon은 `기존 구역 수정`으로 꼭짓점을 그대로 불러올 수 있다.
- 편집 중 꼭짓점을 드래그하면 해당 좌표만 변경된다.
- `편집 취소`를 누르면 저장된 Polygon 표시로 돌아간다.

Mock 여부는 `VITE_ENABLE_MOCK_WORK_ZONE`으로 결정한다.

실제 모드는 네이버 지도 준비 완료 전과 지도 오류 이후에는 새 구역 편집·저장을 막는다. 기존 구역 조회와 초안은 유지하며, 대체 지도에는 저장 Polygon의 범위로 맞춘 읽기 전용 좌표 도식을 표시한다. 이 도식은 현장 배경 지도가 아니며 좌표 입력에 사용하지 않는다. 정상 지도 복구 후 보존한 초안을 저장할 수 있다. 고정 샘플 범위 편집은 명시적 개발 작업 구역 Mock에서만 허용하고 샘플·실제 DB 저장 안 함을 표시한다. 텔레메트리의 데이터 출처나 연결 문자열로 작업 구역 편집 허용 여부를 판단하지 않는다.

네이버 SDK 생성 성공과 인증 성공은 별개다. `naverMapsLoader`는 [공식 인증 실패 콜백](https://navermaps.github.io/maps.js.ncp/docs/tutorial-2-Getting-Started.html)의 `navermap_authFailure`를 작업 지도와 이력 지도에 전달한다. 로딩 후 인증 실패가 도착해도 지도 준비 상태를 해제하고 오류를 표시한다. 실패 뒤 도착한 SDK 응답은 준비 상태를 복원하지 않는다. Client ID, 콘솔의 Web 서비스 URL 및 Web Dynamic Map 사용 설정을 확인한 뒤 화면을 새로고침한다. 인증 실패의 구체적인 원인은 콘솔 설정을 확인하기 전에는 확정하지 않는다.

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
