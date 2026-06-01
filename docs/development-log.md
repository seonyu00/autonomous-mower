# 개발 로그

## 2026-05-30

### 로컬 MQTT Broker

- Docker Compose local development now includes Mosquitto.
- Run only the broker: `docker compose up -d mosquitto`
- Run local dependencies: `docker compose up -d postgres mosquitto`
- Host-local backend default `MQTT_BROKER_URL` is `tcp://localhost:1883`, matching the Compose `1883:1883` port mapping.
- Other Compose containers should use `tcp://mosquitto:1883` on the Compose network.
- Mosquitto local development config is `docker/mosquitto/mosquitto.conf`.
- Anonymous MQTT access is enabled only for local development.

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

### Phase 3 Readiness Review

- Phase 1~2 구현을 reviewer 역할로 검토했다.
- `npm run build` 성공 확인.
- `npm run lint` 성공 확인.
- Phase 3(Control/E-Stop) 진입 전 수정이 필요한 구조적 문제를 식별했다.
- 주요 findings:
  - Auth 상태가 `AuthProvider`와 `authStore`로 분리되어 있어 command authorization drift 위험이 있다.
  - `httpClient`가 active token을 중앙에서 자동 주입하지 않아 control API 호출 시 인증 누락 위험이 있다.
  - `controlStore`가 `hasControl`/`controlOwner`만 갖고 있어 robot-scoped lock, emergency state, mode, last input, pending/error 상태를 표현할 수 없다.
  - `controlApi`가 아직 command DTO와 claim/release/takeover/mode/E-Stop/stop API contract를 갖고 있지 않다.
  - STOMP wrapper가 `activate/deactivate`만 제공해 control-lock/status topic 구독과 command ack/error 반영에 부족하다.
  - mock realtime이 기본적으로 `connected`로 표시되어 Phase 3 UI가 실제 연결 가능 상태와 mock 상태를 혼동할 수 있다.
  - HTTPS protocol indicator가 항상 connected로 표시되어 SRS의 HTTPS/WSS 요구사항을 안전 판단에 활용하기 어렵다.
  - route-level auth guard가 없어 read-only 또는 unauthenticated 상태에서 control surface가 렌더링될 위험이 있다.
- Phase 3 전 권장 수정 순서:
  1. auth source of truth를 단일화하고 `httpClient` token 주입을 중앙화한다.
  2. control type/store를 robot-scoped lock, emergency, mode, last input, command pending/error 중심으로 확장한다.
  3. typed `controlApi` skeleton과 RBAC/state precheck를 구현한다.
  4. STOMP wrapper에 robot-scoped subscription 및 control-lock/status event 처리 구조를 추가한다.
  5. `canControlRobot(robotId)` selector를 추가해 RBAC, selected robot, lock ownership, realtime, emergency, transport security를 결합한다.

### Phase 3. Mode and Attachment Commands - Pass 4

- `ControlPanel`에 일반 제어 명령 UI를 추가했다.
- `GeneralControlCommands` 컴포넌트를 신규 작성했다.
  - AUTO/MANUAL/HOME 모드 전환 버튼
  - 작업 시작/정지 버튼
  - 예초 장치 구동/정지 버튼
  - 작업장치 상승/하강 버튼
- `changeMode` API skeleton을 UI와 연결했다.
  - AUTO는 `autonomous`
  - MANUAL은 `manual`
  - HOME은 `home`
  - 작업 시작은 mock 단계에서 `autonomous`
  - 작업 정지는 mock 단계에서 `idle`
- `sendMowerAttachmentCommand` API skeleton을 UI와 연결했다.
  - `blade-start`
  - `blade-stop`
  - `raise`
  - `lower`
- `ControlCommandPayload` 타입을 확장했다.
  - `ModeCommand`
  - `MowerAttachmentCommand`
  - 기존 `ManualCommand`, `StopCommand`
- mock fallback에서 `change-mode` 명령을 받으면 control store의 `mode`를 갱신하도록 했다.
- 모든 일반 명령은 기존 `canControlRobot(robotId)` selector를 통과해야만 실행되도록 유지했다.
  - E-Stop 상태
  - 제어권 없음
  - read-only 권한
  - realtime degraded/disconnected
  - transport-not-ready
  상태에서는 명령 버튼이 비활성화된다.
- E-Stop과 `sendStopCommand` 우선순위 로직은 변경하지 않았다.
- 명령 실패 시 local error와 `commandError`를 UI에 표시하도록 했다.
- `npm run build` 성공 확인.
- `npm run lint` 성공 확인.
- 남은 경고:
  - Vite build에서 React Router/TanStack Query `"use client"` directive 무시 경고가 계속 발생한다.
  - MapLibre 포함 bundle chunk size 경고가 계속 발생한다.

### Phase 3. Final Control Safety Review

- Phase 3 전체 제어 기능을 reviewer 관점으로 검토했다.
- 검토 범위:
  - Control ownership
  - E-Stop
  - ManualJoystick
  - 500ms deadman switch
  - AUTO/MANUAL/HOME mode commands
  - 작업 시작/정지
  - 예초 장치 구동/정지
  - 작업장치 상승/하강
  - RBAC/state precheck
  - mock mode와 실제 API 전환 위험
- High finding:
  - `resetAfterEmergency` API skeleton이 UI에서는 E-Stop 패널에서만 노출되지만 함수 자체에서는 selected robot, emergency state, HTTPS transport를 재검증하지 않았다.
  - 실제 API 전환 시 E-Stop 복구 명령이 너무 넓게 열릴 수 있어 최소 범위로 수정했다.
- High finding 수정:
  - `canResetAfterEmergency(robotId)` selector를 추가했다.
  - E-Stop 복구 명령은 인증, `control:write`, selected robot 일치, emergency 상태, HTTPS transport를 통과해야 한다.
  - `resetAfterEmergency` API skeleton이 새 selector를 사용하도록 변경했다.
  - `ControlPanel`의 Reset After Emergency 버튼도 새 precheck 결과에 따라 비활성화하고 사유를 표시하도록 변경했다.
- Medium findings:
  - `beforeunload`에서 비동기 `sendStopCommand` 완료는 브라우저가 보장하지 않는다. 실제 API 전환 전 `keepalive` 또는 beacon-compatible stop endpoint와 서버/Jetson/STM32 fail-safe가 필요하다.
  - mock fallback은 DEV 환경에서만 동작한다. 실제 API 전환 시 backend command contract, ack/error, idempotency, QoS 정책을 별도 테스트해야 한다.
  - 제어권 자동 해제는 현재 STOMP topic lifecycle과 UI skeleton만 있고 서버 이벤트 반영 테스트는 아직 없다.
- Low findings:
  - Mode/attachment command payload는 skeleton 수준이며 backend DTO 확정 후 필드명을 재검토해야 한다.
  - E-Stop, deadman, RBAC precheck에 대한 자동화 테스트는 Phase 4 품질 단계에서 추가해야 한다.
- `npm run build` 성공 확인.
- `npm run lint` 성공 확인.

### Current Notes

- MapLibre 지도 스타일은 `https://demotiles.maplibre.org/style.json`을 사용한다. 실제 화면 렌더링에는 네트워크 접근이 필요하다.
- Vite build에서 React Router/TanStack Query의 `"use client"` directive 무시 경고가 출력된다. 현재 빌드 실패 요인은 아니다.
- MapLibre 추가 후 bundle chunk size 경고가 발생한다. Phase 2 후반 또는 Phase 4 전에 route-level lazy loading/code splitting을 검토한다.
- Polygon 편집, 실제 저장, 실제 snapshot 이미지 렌더링, E-Stop, joystick, WebRTC는 아직 후속 단계 범위다.

### Frontend Implementation Status - Phase 1 to Phase 4

#### Completed Scope

- Phase 1 foundation
  - Vite + React + TypeScript frontend project.
  - React Router pages: Login, Map View, History, Log Viewer, Settings.
  - AppShell layout: Header, Sidebar, main content, right status area.
  - Auth source of truth through `authStore` and `AuthProvider`.
  - RBAC model and `PermissionGate`.
  - REST `httpClient` with central access token injection.
  - Zustand stores for robot selection, telemetry, control, and video state.
  - STOMP client skeleton with robot-scoped subscription lifecycle.
  - Dashboard basics: RobotList, ProtocolIndicators, TelemetryPanel.
- Phase 2 map, work zone, history, logs
  - MapLibre GL selected and connected in Map View.
  - Mock robot marker, route polyline, and work-zone Polygon display.
  - `WorkZoneEditor` skeleton with Polygon coordinate display.
  - GeoJSON Polygon validation and PostGIS SRID 4326-compatible payload conversion.
  - Work-zone save API skeleton.
  - History page with date range, robot filter, mock route data, route map, and event timeline placeholder.
  - Log Viewer with filters, severity filtering, mock logs, log timeline, and snapshot placeholder.
- Phase 3 control and safety
  - Robot-scoped control ownership state.
  - Control lock states: `none`, `requesting`, `held`, `held-by-other`, `expired`, `revoked`.
  - ControlPanel with request/release/takeover.
  - Global E-Stop with confirmation dialog and recovery placeholder.
  - `canControlRobot`, `canSendEmergencyStop`, `canSendStopCommand`, `canResetAfterEmergency` selectors.
  - ManualJoystick with command payload preview.
  - 500ms deadman switch.
  - Stop command on pointerup, pointercancel, blur, visibilitychange, pagehide, beforeunload.
  - AUTO/MANUAL/HOME mode command UI.
  - Work start/stop, mower blade start/stop, attachment raise/lower command UI.
  - E-Stop state blocks normal commands and does not auto-resume previous commands after reset.
- Phase 4 quality and video foundation
  - Vitest + React Testing Library + jest-dom + jsdom setup.
  - Unit tests for RBAC, control selectors, E-Stop normal-command blocking, read-only command rejection, deadman switch, and video store transitions.
  - VideoPanel in right status area.
  - WebRTCClient wrapper with RTCPeerConnection lifecycle.
  - Mock signalling skeleton: `startStream`, `stopStream`, `reconnectStream`.
  - Video state UI: loading, error, disconnected, connected, reconnecting.
  - Stream lifecycle stop on page hide/unload, selected robot change, and permission loss.
  - WebRTC connection timeout and ICE failure/disconnect state handling.
  - SRS video policy display: 15fps minimum, 480p, 500kbps max.
  - Snapshot placeholder type aligned with log `SnapshotRef`.

#### Mock or Skeleton Areas

- Authentication uses mock session defaults. Real login API skeleton exists but is not wired to a deployed backend.
- Robot list, telemetry, history, logs, work zones, and map overlays still use mock/fallback data in DEV.
- Work-zone Polygon edit-on-map and real persistence are not implemented.
- STOMP connection and topic lifecycle exist, but payload parsing and store updates are still minimal.
- Control APIs are skeletons with DEV mock state updates.
- Command ack/error, idempotency, sequence numbers, QoS behavior, and server-side lock expiry are not implemented in frontend contracts yet.
- WebRTC signalling uses mock responses when no signalling URL/backend exists.
- Video playback uses a placeholder unless a real remote MediaStream arrives.
- Snapshot capture/upload is placeholder only. Logs can display snapshot metadata, but real JPEG rendering depends on backend-provided URLs.
- Route-level auth guard remains a known hardening item.

#### REST API Contract Needed Before Backend Integration

- Auth
  - `POST /api/auth/login`
  - Request: username/password or backend-approved credential format.
  - Response: access token, refresh/expiry policy, role, permissions, user profile.
- Robots
  - `GET /api/robots`
  - `GET /api/robots/{robotId}`
  - Required fields: id, modelName, active, connectionState, current control summary if available.
- Telemetry/history/logs
  - `GET /api/history?robotId=&from=&to=`
  - Must return PostGIS-compatible route structures, preferably GeoJSON `LineString` with `srid: 4326`.
  - `GET /api/logs?robotId=&from=&to=&severity=&text=`
  - Must return `LogEntry` including optional `SnapshotRef`.
- Work zone
  - `GET /api/robots/{robotId}/work-zone`
  - `PUT /api/robots/{robotId}/work-zone`
  - Payload must clarify GeoJSON Polygon format, SRID 4326, ring closure, validation error shape, and version/update conflict handling.
- Control
  - `POST /api/control/{robotId}/claim`
  - `POST /api/control/{robotId}/release`
  - `POST /api/control/{robotId}/takeover`
  - `POST /api/control/{robotId}/mode`
  - `POST /api/control/{robotId}/manual`
  - `POST /api/control/{robotId}/stop`
  - `POST /api/control/{robotId}/estop`
  - `POST /api/control/{robotId}/reset-after-emergency`
  - `POST /api/control/{robotId}/attachment`
  - Required contract items: command id, requester id, lock owner, lock version, accepted/rejected status, rejection reason, server timestamp, command sequence, idempotency key, and explicit E-Stop priority semantics.
- Video
  - `POST /api/video/{robotId}/offer`
  - `POST /api/video/{robotId}/stop`
  - `POST /api/video/{robotId}/reconnect`
  - Required contract items are listed below in WebRTC signalling.

#### STOMP Topic Contract Needed

- Current topic names are assumptions unless backend confirms them.
- Existing frontend topic skeleton:
  - `/topic/robots/{robotId}/telemetry`
  - `/topic/robots/{robotId}/status`
  - `/topic/robots/{robotId}/events`
  - `/topic/robots/{robotId}/control-lock`
- Planned/needed topic:
  - `/topic/robots/{robotId}/video-status`
- Required payload contracts:
  - Telemetry: robotId, timestamp, latitude, longitude, speed, battery, signal, mode, workState, errorState.
  - Status: robotId, connection state, subsystem status, stale/heartbeat timestamp.
  - Events: event id, severity, type, occurredAt, source, message, optional location/snapshot.
  - Control lock: robotId, lockState, owner id/name, expiresAt, version, reason, updatedAt.
  - Control command ack/error: command id, command type, accepted, status, reason, server timestamp.
  - Video status: robotId, sessionId, state, bitrate, fps, resolution, error reason.
- Operational requirements:
  - WSS only outside local mock/dev.
  - Auth token location must be defined: STOMP connect headers or cookie/session.
  - Reconnect/backoff policy and duplicate subscription cleanup must be agreed.

#### WebRTC Signalling Contract Needed

- Frontend currently supports REST-style signalling skeleton.
- Start stream:
  - `POST /api/video/{robotId}/offer`
  - Request: robotId, SDP offer, offer type, optional desired quality policy.
  - Response: sessionId, SDP answer, answer type, ICE servers, mock flag not needed in production.
- Stop stream:
  - `POST /api/video/{robotId}/stop`
  - Request: robotId, sessionId.
  - Response: 204 or explicit stopped state.
- Reconnect:
  - `POST /api/video/{robotId}/reconnect`
  - Request: robotId, previous sessionId.
  - Response should define whether client must create a fresh offer or reuse a session.
- Missing decisions:
  - Trickle ICE support or single offer/answer exchange only.
  - ICE candidate endpoint/topic shape if trickle ICE is used.
  - Codec policy: H.264/H.265, NVENC constraints, browser compatibility fallback.
  - Quality policy enforcement: 15fps minimum, 480p, max 500kbps.
  - Snapshot capture ownership: frontend canvas capture, backend frame capture, or robot-side snapshot.
  - Whether video loss affects manual control eligibility. Current frontend does not automatically allow/deny control based on video status.

#### Remaining Vite Warnings and Plan

- Warning: React Router and TanStack Query module-level `"use client"` directives are ignored by Vite/Rollup.
  - Current impact: warning only, build succeeds.
  - Plan: leave unless it becomes noisy in CI; optionally suppress known directive warnings in Rollup `onwarn` after confirming no real warnings are hidden.
- Warning: large bundle chunk caused mainly by MapLibre and map-heavy pages.
  - Current impact: warning only, build succeeds.
  - Plan: apply route-level lazy loading and isolate MapLibre imports inside lazily loaded route modules.

#### Route-Level Lazy Loading Plan for MapLibre Chunk Size

1. Convert route elements in `src/app/routes.tsx` to lazy imports:
   - `MapViewPage`
   - `HistoryPage`
   - `LogViewerPage`
   - `SettingsPage`
2. Wrap route outlet/page elements with `React.Suspense` and a compact loading fallback.
3. Keep `AppShell`, Header, Sidebar, RobotList, TelemetryPanel, VideoPanel in the main shell chunk.
4. Ensure MapLibre imports remain only inside map-related lazy chunks:
   - `MapViewMap`
   - `HistoryMap`
5. Optionally split History map from History filters/timeline if the history page should load quickly before map code.
6. Re-run `npm run build` and compare chunk output.
7. If warning remains, add `build.rollupOptions.output.manualChunks`:
   - `maplibre` chunk for `maplibre-gl`
   - `vendor` chunk for React/Router/TanStack if needed
8. Add a short smoke check:
   - `/map` loads and renders MapLibre placeholder/map.
   - `/history` lazy map still renders selected route.
   - `/logs`, `/settings` are unaffected.
