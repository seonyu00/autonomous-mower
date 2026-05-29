# Development Log

## 2026-05-30

### Planning

- `AGENTS.md` 지침에 따라 작업 전 `SRS.md`, `docs/*`, 기존 코드 구조를 확인했다.
- `docs/frontend-masterplan.md` 작성.
  - SRS 기반으로 백엔드, PostgreSQL/PostGIS, Jetson/STM32, MQTT/WebSocket/STOMP/WebRTC, 웹 관제 프론트엔드 요구사항을 정리했다.
  - React 중심 기술 스택, `src` 디렉토리 구조, 주요 컴포넌트, 상태 관리, REST/WSS/STOMP/WebRTC 모듈, 예외/재연결 전략, 4단계 로드맵을 정의했다.
  - SRS에 없는 API endpoint, signaling 방식, 라이브러리 세부 선택은 `추정`으로 표시했다.
- `docs/task-breakdown.md` 작성.
  - reviewer 관점으로 안전 기능, RBAC, 통신 장애 대응, 제어권, Polygon 작업 구역, 이력/로그/스냅샷 조회를 검토했다.
  - epics/tasks 단위 작업 목록으로 정리했다.

### Phase 1. Frontend Foundation

- Vite + React + TypeScript 기반 `frontend` 프로젝트를 생성했다.
- React Router 라우팅을 구성했다.
  - `Login`
  - `Map View`
  - `History`
  - `Log Viewer`
  - `Settings`
- `AppShell` 레이아웃을 구현했다.
  - Header
  - Sidebar
  - main content
  - right status area
- 인증/RBAC skeleton을 구현했다.
  - `AuthProvider`
  - `authContext`
  - `authStore`
  - `PermissionGate`
  - role: `read-only`, `operator`, `supervisor`, `admin`
- REST 통신 skeleton을 구현했다.
  - `httpClient`
  - `ApiError`
  - 상태 코드 분류
- Zustand store skeleton을 구현했다.
  - 선택 로봇 store
  - 텔레메트리 store
  - 제어권 store
  - 영상 store
- STOMP/WSS skeleton을 구현했다.
  - `stompClient`
  - `reconnectPolicy`
  - `topicRouter`
  - `stompTopics`
- mock/fallback 데이터를 추가했다.
  - mock robot list
  - mock telemetry
- 기본 대시보드 화면을 구현했다.
  - `RobotList`
  - `ProtocolIndicators`
  - `TelemetryPanel`
  - map placeholder
- 공통 UI skeleton을 추가했다.
  - `Button`
  - `StatusBadge`
  - `Dialog`
  - `Toast`
  - `ErrorBoundary`
- TanStack Query provider를 추가했다.
  - `QueryProvider`
  - 기본 retry/refetch 정책 설정
- E-Stop, joystick, WebRTC, Polygon editing은 구현하지 않고 placeholder/skeleton만 유지했다.

### Phase 1 Review Fixes

- Phase 1 계획 대비 누락된 `QueryProvider`, `Dialog`, `Toast`, `ErrorBoundary`, `authStore`를 추가했다.
- RBAC role 이름을 task breakdown 기준에 맞춰 정리했다.
- `npm run build` 성공 확인.
- `npm run lint` 성공 확인.

### Phase 2. Map View - Pass 1

- 지도 라이브러리를 MapLibre GL로 선택했다.
- `maplibre-gl` 의존성을 추가했다.
- 기존 CSS 기반 `MapPlaceholder`를 제거하고 `MapViewMap`을 추가했다.
- Map View에 기본 MapLibre 지도를 연결했다.
- mock 로봇 현재 위치 마커를 표시했다.
- mock 이동 궤적 polyline을 표시했다.
- mock 작업 구역 Polygon을 read-only placeholder로 표시했다.
- `mockMapData.ts`를 추가해 로봇별 route/zone GeoJSON mock 데이터를 분리했다.
- Polygon 편집/저장은 구현하지 않았다.
- `npm run build` 성공 확인.
- `npm run lint` 성공 확인.

### Phase 2. Work Zone - Pass 2

- `WorkZoneEditor` skeleton을 추가했다.
- 선택 로봇의 mock Polygon 좌표 목록을 표시했다.
- GeoJSON Polygon 유효성 검사 유틸을 구현했다.
  - geometry type 검사
  - 최소 linear ring 검사
  - exterior ring 최소 좌표 수 검사
  - WGS84 longitude/latitude 범위 검사
  - 닫힌 ring 검사
  - 기본 self-intersection 검사
- PostGIS `Polygon, SRID 4326`과 호환되는 payload 변환 함수를 구현했다.
  - `toPostGisPolygonPayload`
  - `fromPostGisPolygonPayload`
- 작업 구역 API client skeleton을 확장했다.
  - `getWorkZone`
  - `saveWorkZone`
  - DEV 환경에서는 실제 저장하지 않고 저장 요청 형태만 반환한다.
- `WorkZoneEditor`를 `MapViewPage`에 연결했다.
- 실제 지도 위 Polygon 편집/저장은 구현하지 않았다.
- `npm run build` 성공 확인.
- `npm run lint` 성공 확인.

### Phase 2. History - Pass 3

- `HistoryPage`를 placeholder에서 실제 mock 기반 조회 화면으로 교체했다.
- 날짜 범위 선택 UI를 추가했다.
  - `from`
  - `to`
- 로봇 선택 UI를 추가했다.
- history API client skeleton을 확장했다.
  - DEV 환경에서는 mock 데이터를 날짜 범위와 로봇 ID로 필터링한다.
  - 실제 환경에서는 `/api/history?robotId=&from=&to=` 형태의 REST 호출 구조를 유지한다.
- PostGIS 경로 데이터와 호환되도록 이력 타입을 GeoJSON 기반으로 확장했다.
  - 주행 궤적: `Feature<LineString>`
  - 이벤트 위치: `Feature<Point>`
  - geometry properties에 `srid: 4326` metadata를 포함했다.
- `mockHistory.ts`를 추가했다.
  - 로봇별 mock 주행 이력
  - 과거 궤적 LineString
  - 이벤트 timeline 데이터
  - 일부 이벤트 위치 Point
- `HistoryMap`을 추가했다.
  - MapLibre 지도에 과거 궤적 polyline을 표시한다.
  - 이벤트 위치 Point를 표시한다.
  - 선택된 이력이 바뀌면 route bounds로 지도를 이동한다.
- `HistoryTimeline`을 추가했다.
  - 이벤트 타임라인 placeholder 성격으로 mock 이벤트를 표시한다.
- History 화면 스타일을 추가했다.
  - filter form
  - result list
  - history map shell
  - timeline event
- 실제 API 연동은 구현하지 않고 mock 데이터만 사용했다.
- `npm run build` 성공 확인.
- `npm run lint` 성공 확인.

### Phase 2. Log Viewer - Pass 4

- `LogViewerPage`를 placeholder에서 실제 mock 기반 로그 조회 화면으로 교체했다.
- 로그 검색 필터 UI를 추가했다.
  - robot filter
  - severity filter
  - date range filter
  - text search
- logs API client skeleton을 확장했다.
  - DEV 환경에서는 mock 데이터를 robot, severity, date range, text 기준으로 필터링한다.
  - 실제 환경에서는 `/api/logs?robotId=&severity=&text=&from=&to=` 형태의 REST 호출 구조를 유지한다.
- 향후 logs API와 호환되도록 로그 타입을 확장했다.
  - `LogSeverity`
  - `LogEventType`
  - `SnapshotRef`
  - `LogEntry`
  - `LogQuery`
- `mockLogs.ts`를 추가했다.
  - obstacle detected
  - communication lost
  - E-Stop
  - sensor fault
  - job event
  - snapshot metadata
- `LogTimeline`을 추가했다.
  - severity별 timeline item 표시
  - 선택 로그 상태 지원
- `SnapshotViewer` placeholder를 추가했다.
  - snapshot metadata 표시
  - 실제 JPEG 렌더링은 logs API가 snapshot URL을 제공할 때 연결하도록 남겨두었다.
- 선택 로그의 metadata preview를 추가했다.
- Log Viewer 화면 스타일을 추가했다.
  - filter form
  - timeline panel
  - snapshot placeholder
  - log metadata panel
- 실제 API 연동은 구현하지 않고 mock 데이터만 사용했다.
- `npm run build` 성공 확인.
- `npm run lint` 성공 확인.

### Current Notes

- MapLibre 지도 스타일은 `https://demotiles.maplibre.org/style.json`을 사용한다. 실제 화면 렌더링에는 네트워크 접근이 필요하다.
- Vite build에서 React Router/TanStack Query의 `"use client"` directive 무시 경고가 출력된다. 현재 빌드 실패 요인은 아니다.
- MapLibre 추가 후 bundle chunk size 경고가 발생한다. Phase 2 후반 또는 Phase 4 전에 route-level lazy loading/code splitting을 검토한다.
- Polygon 편집, 실제 저장, 실제 snapshot 이미지 렌더링, E-Stop, joystick, WebRTC는 아직 후속 단계 범위다.
