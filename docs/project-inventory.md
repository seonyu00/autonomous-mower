# 프로젝트 인벤토리

이 문서는 GitHub 공유와 팀원 온보딩을 위한 현재 코드 기준 기능 인벤토리이다.

기준:

- 확인일: 2026-06-14
- 확인 범위: `frontend/`, `backend/`, `edge/jetson-client/`, `edge/jetson-camera/`, `edge/jetson-video/`, `tools/edge-mock-client/`, `docker-compose.yml`, `docs/`, `.env.example`, `README.md`
- 실제 파일 기준으로 정리했다.
- 구현 여부가 불명확하거나 실제 장비 연동이 없는 부분은 `미구현/확인 필요` 또는 `Mock/Skeleton`으로 표시했다.

## 1. 전체 시스템 아키텍처 요약

현재 저장소는 자율주행 예초기 관제 시스템의 로컬 통합 환경을 구성한다.

```text
React Dashboard
  | REST API, STOMP/WebSocket, MediaMTX WHEP
  v
Spring Boot Backend
  | JPA/Flyway/PostGIS
  v
PostgreSQL/PostGIS

Spring Boot Backend
  | MQTT command publish / inbound subscribe
  v
Mosquitto MQTT Broker
  ^
  | telemetry/status/event/ack publish, command subscribe
Jetson Edge Client 또는 Edge Mock Client

RealSense D455
  | ROS 2 raw image
  v
Jetson Video Streamer
  | NVENC H.264 / RTSP
  v
MediaMTX
  | WHEP/WebRTC
  v
React VideoPanel
```

### Frontend

- 위치: `frontend/`
- 기술: React 19, TypeScript, Vite, Zustand, React Router, TanStack Query, MapLibre GL, STOMP client, Vitest
- 역할:
  - 관리자 로그인 화면과 관제 대시보드 UI 제공
  - 로봇 선택, 지도, 텔레메트리, 작업 구역, 제어 패널, 히스토리, 로그, 영상 패널 표시
  - REST API 호출과 개발 모드 mock 데이터 처리
  - STOMP/WebSocket으로 실제 텔레메트리, 상태, 제어권과 제어 이벤트 반영
  - 백엔드 영상 세션 API와 MediaMTX WHEP를 통한 실제 WebRTC 영상 재생

### Backend

- 위치: `backend/`
- 기술: Spring Boot 3.3.7, Java 21, Spring Security, JPA, Flyway, Hibernate Spatial, PostgreSQL, Paho MQTT, WebSocket/STOMP, JJWT
- 역할:
  - JWT 기반 REST 인증과 RBAC 권한 검증
  - 로봇, 작업 구역, 히스토리, 로그, 제어 REST API 제공
  - PostgreSQL/PostGIS persistence
  - MQTT command bridge와 inbound telemetry/status/event/ack 처리
  - STOMP topic publish
  - 제어권 lock, E-Stop, Deadman timeout, command ack lifecycle 처리

### PostgreSQL/PostGIS

- 위치: `docker-compose.yml`, `backend/src/main/resources/db/migration/`
- 이미지: `postgis/postgis:16-3.4`
- 역할:
  - `robot`, `admin_account`, `work_zone`, `telemetry_log`, `robot_event`, `command_execution` 저장
  - `work_zone.zone_polygon geometry(Polygon, 4326)`
  - `telemetry_log.location_point geometry(Point, 4326)`
  - PostGIS spatial index 사용

### MQTT Broker

- 위치: `docker-compose.yml`, `docker/mosquitto/mosquitto.conf`
- 이미지: `eclipse-mosquitto:2`
- 기본 포트: `1883`
- 역할:
  - Backend -> Edge command topic 중계
  - Edge -> Backend telemetry/status/event/command ack topic 중계

### Edge Mock Client

- 위치: `tools/edge-mock-client/`
- 기술: Node.js 20+, `mqtt`
- 역할:
  - 실제 장비 없이 로컬 MQTT 통합 테스트 수행
  - command topic 구독
  - telemetry/status/event/ack publish
  - E-Stop, stop, mode command 수신 시 mock 상태 변경

### Jetson Edge Client

- 위치: `edge/jetson-client/`
- 기술: Python 3.10, ROS 2 Humble, Paho MQTT
- 역할:
  - backend command topic 구독과 payload 검증
  - 수동 명령 최신성 검사, QoS 1 중복 억제, 500ms 로컬 deadman 처리
  - `/cmd_vel`, `/mower/set_mode`, `/mower/engine` ROS 2 topic 발행
  - GPS/IMU topic 구독과 telemetry/status/command ACK 발행
- 제한:
  - STM32 USB CDC serial bridge와 attachment 실제 출력은 아직 구현되지 않았다.
  - battery, speed, signal strength 등 일부 telemetry 값은 기본값 또는 후속 구현 대상이다.

### Jetson Camera Scripts

- 위치: `edge/jetson-camera/`
- 기술: Bash, ROS 2 Humble, RealSense ROS, image_transport
- 역할:
  - RealSense D455를 컬러·깊이 640x480, 15fps로 수동 실행
  - RealSense 내부 compressed publisher 대신 별도 JPEG republisher 실행
  - USB, ROS 2 노드, 원본 해상도·주기와 JPEG payload 자동 검증
- 제한:
  - systemd 자동 실행은 아직 구성하지 않았다.
  - Foxglove 화면 확인은 아직 별도 검증이 필요하다.
  - 웹 WebRTC 송출은 `edge/jetson-video/`에서 별도 프로세스로 실행한다.

### STOMP/WebSocket

- Backend:
  - endpoint: `/ws`
  - topic prefix: `/topic`
  - 주요 파일: `backend/src/main/java/com/autonomousmower/config/WebSocketConfig.java`, `backend/src/main/java/com/autonomousmower/realtime/service/RealtimePublisher.java`, `backend/src/main/java/com/autonomousmower/realtime/service/RealtimeTopics.java`
  - JWT CONNECT 인증: `backend/src/main/java/com/autonomousmower/realtime/security/StompJwtAuthenticationInterceptor.java`
- Frontend:
  - 주요 파일: `frontend/src/shared/realtime/stompClient.ts`, `frontend/src/app/providers/RealtimeProvider.tsx`
  - 현재 mock realtime이 켜져 있으면 STOMP client는 실제 연결하지 않고 `mock` 상태로 처리한다.
  - 실제 topic message를 store에 반영하는 부분은 제한적이며 추가 연결 필요.

### MediaMTX WebRTC 영상

- Frontend:
  - `frontend/src/features/video/WebRtcClient.ts`
  - `frontend/src/features/video/WhepClient.ts`
  - `frontend/src/features/video/signalingApi.ts`
  - `frontend/src/features/video/videoStore.ts`
  - `frontend/src/features/video/components/VideoPanel.tsx`
- 기능:
  - 백엔드에서 로봇별 WHEP URL 발급
  - MediaMTX WHEP SDP 교환
  - WHEP resource 종료 시 `DELETE`
  - start/stop/reconnect/snapshot placeholder UI
- Backend:
  - `/api/video/{robotId}/offer|stop|reconnect`
  - `telemetry:read` 권한 검증
  - `/topic/robots/{robotId}/video-status` 상태 발행
- Jetson:
  - `edge/jetson-video/`
  - ROS 2 raw image를 NVENC H.264로 인코딩
  - RTSP로 MediaMTX에 발행
  - MediaMTX WHEP로 브라우저에 전달
- 실제 검증:
  - RealSense 컬러 원본 640x480, 약 15fps 발행 확인
  - MediaMTX에서 H.264 Baseline 트랙 온라인 확인
  - Chrome WHEP 연결 상태 `connected` 확인
  - 8초 동안 119프레임, 629,869바이트 수신 확인
- 제한:
  - 백엔드 stop은 세션 상태와 브라우저 WHEP 연결을 종료하지만 Jetson 인코더와 RTSP publisher 프로세스까지 중단하지는 않는다.
  - Jetson 카메라, MediaMTX와 영상 송출기는 `run-video-demo.sh` 한 명령으로 실행할 수 있지만 재부팅 후 자동 복구되지는 않는다.
  - HTTPS/WSS, MediaMTX TLS, TURN과 외부 인터넷 공개는 아직 적용하지 않았다.
  - Snapshot 버튼은 실제 이미지 저장이 아닌 프론트 상태 placeholder다.

## 2. 프론트엔드 기능 목록

### 구조

- 진입점: `frontend/src/main.tsx`
- App 구성:
  - `frontend/src/app/App.tsx`
  - `frontend/src/app/routes.tsx`
  - `frontend/src/app/providers/AuthProvider.tsx`
  - `frontend/src/app/providers/QueryProvider.tsx`
  - `frontend/src/app/providers/RealtimeProvider.tsx`
- 레이아웃:
  - `frontend/src/layout/AppShell.tsx`
  - 헤더, protocol indicators, global E-Stop, profile block, sidebar navigation, robot list, main outlet, status sidebar를 배치한다.
- 공통 UI:
  - `frontend/src/shared/ui/Button.tsx`
  - `frontend/src/shared/ui/Dialog.tsx`
  - `frontend/src/shared/ui/ErrorBoundary.tsx`
  - `frontend/src/shared/ui/PhasePlaceholder.tsx`
  - `frontend/src/shared/ui/StatusBadge.tsx`
  - `frontend/src/shared/ui/Toast.tsx`
- 스타일:
  - `frontend/src/styles.css`

### 인증/Login

주요 파일:

- `frontend/src/pages/LoginPage.tsx`
- `frontend/src/features/auth/api.ts`
- `frontend/src/features/auth/authStore.ts`
- `frontend/src/app/providers/AuthProvider.tsx`
- `frontend/src/features/auth/types.ts`

구현 내용:

- `/login` 라우트에서 로그인 폼 제공
- `login()`은 `/api/auth/login`으로 `adminId`, `password` 전송
- 응답의 `user`, `accessToken`을 Zustand auth store에 저장
- mock auth가 켜져 있으면 `Mock Admin Login` 버튼으로 mock admin 세션 생성
- 현재 로그인 폼 기본 admin/password 값은 비워져 있다.

주의:

- 실제 admin 계정 seed는 제거되어 있다. 로컬 admin credential은 별도 provision 필요.
- token persistence는 현재 메모리 store 기반이다. 브라우저 reload 후 세션 유지 기능은 확인 필요.

### RBAC

주요 파일:

- `frontend/src/shared/lib/permissions.ts`
- `frontend/src/features/auth/guards.tsx`
- `frontend/src/features/auth/types.ts`
- 테스트: `frontend/src/shared/lib/permissions.test.ts`

역할:

- role별 permission mapping:
  - `read-only`: `robots:read`, `telemetry:read`, `history:read`, `logs:read`
  - `operator`: read 권한 + `control:write`
  - `supervisor`: operator 권한 + `settings:read`, `control:takeover`
  - `admin`: supervisor와 동일
- `PermissionGate`로 UI 노출 제어
- 제어 API 호출 전 client-side precheck에서도 권한 확인

주의:

- 프론트 RBAC는 UX/사전 차단용이다. 실제 보안은 백엔드 `@PreAuthorize`와 JWT 검증이 담당한다.

### Dashboard/AppShell

주요 파일:

- `frontend/src/layout/AppShell.tsx`
- `frontend/src/app/routes.tsx`

구현 내용:

- `/map`, `/history`, `/logs`, `/settings` route 구성
- sidebar:
  - Map View
  - History
  - Log Viewer
  - Settings
  - Robot List
- header:
  - 앱 타이틀
  - protocol 상태
  - global E-Stop
  - 사용자 표시
- right status area:
  - `TelemetryPanel`
  - `VideoPanel`

확인 필요:

- 인증되지 않은 사용자의 `/map` 접근 차단 route guard는 명시적으로 보이지 않는다. API 호출은 token 없으면 실패하지만 UI route 보호는 추가 검토 필요.

### MapLibre 지도

주요 파일:

- `frontend/src/pages/MapViewPage.tsx`
- `frontend/src/features/map/components/MapViewMap.tsx`
- `frontend/src/features/map/mockMapData.ts`

구현 내용:

- MapLibre GL 사용
- demotiles style 사용: `https://demotiles.maplibre.org/style.json`
- mock work zone polygon source/layer
- mock route line source/layer
- selected robot telemetry 위치에 marker 표시
- telemetry 위치 변경 시 `easeTo`로 지도 center 이동

Mock/Skeleton:

- 지도 배경은 외부 demo tile style에 의존한다.
- 현재 지도 표시 polygon/route는 mock data 기반이다.
- 실제 backend work-zone fetch와 지도 편집 UI 연결은 제한적이다.

### 작업 구역 Polygon

Frontend 주요 파일:

- `frontend/src/features/map/components/WorkZoneEditor.tsx`
- `frontend/src/features/map/geojson.ts`
- `frontend/src/features/map/zoneApi.ts`
- `frontend/src/features/map/zoneStore.ts`
- `frontend/src/features/map/types.ts`

Backend 대응:

- `backend/src/main/java/com/autonomousmower/workzone/controller/WorkZoneController.java`
- `backend/src/main/java/com/autonomousmower/workzone/service/WorkZoneService.java`
- `backend/src/main/java/com/autonomousmower/workzone/service/GeoJsonPolygonMapper.java`
- `backend/src/main/resources/db/migration/V2__create_core_domain_tables.sql`
- `backend/src/main/resources/db/migration/V3__add_work_zone_version.sql`

구현 내용:

- Polygon validation:
  - type 확인
  - SRID 4326 payload 변환
  - 좌표 preview
  - validation error 표시
- 개발 모드에서는 `saveWorkZone()`이 실제 API 호출 대신 mock response 반환
- production 모드에서는 `/api/robots/{robotId}/work-zone` GET/PUT 사용
- backend는 PostGIS `geometry(Polygon, 4326)` 저장 및 version update 지원

Mock/Skeleton:

- 프론트 지도 위 직접 polygon 그리기/편집 UX는 미구현이다.
- 현재 WorkZoneEditor는 mock polygon을 request payload로 만드는 수준이다.

### History

Frontend 주요 파일:

- `frontend/src/pages/HistoryPage.tsx`
- `frontend/src/features/history/api.ts`
- `frontend/src/features/history/mockHistory.ts`
- `frontend/src/features/history/components/HistoryTimeline.tsx`
- `frontend/src/features/history/components/HistoryMap.tsx`
- `frontend/src/features/history/types.ts`

Backend 주요 파일:

- `backend/src/main/java/com/autonomousmower/history/controller/HistoryController.java`
- `backend/src/main/java/com/autonomousmower/history/service/HistoryService.java`
- `backend/src/main/java/com/autonomousmower/telemetry/repository/TelemetryLogRepository.java`
- `backend/src/main/java/com/autonomousmower/telemetry/entity/TelemetryLog.java`

구현 내용:

- Frontend:
  - 개발 모드에서는 mock history 사용
  - production 모드에서는 `/api/history?robotId=&from=&to=` 호출
  - timeline과 map 표시 component 존재
- Backend:
  - `history:read` 권한 필요
  - `telemetry_log`를 조회해 GeoJSON LineString route 생성
  - 현재 distance/coverage는 `0`으로 반환
  - events는 현재 빈 배열 반환

Mock/Skeleton:

- coverage 계산 미구현
- route distance 계산 미구현
- history event aggregation 미구현

### Logs/Snapshot placeholder

Frontend 주요 파일:

- `frontend/src/pages/LogViewerPage.tsx`
- `frontend/src/features/logs/api.ts`
- `frontend/src/features/logs/mockLogs.ts`
- `frontend/src/features/logs/components/LogTimeline.tsx`
- `frontend/src/features/logs/components/SnapshotViewer.tsx`
- `frontend/src/features/logs/types.ts`

Backend 주요 파일:

- `backend/src/main/java/com/autonomousmower/logs/controller/LogController.java`
- `backend/src/main/java/com/autonomousmower/logs/service/LogService.java`
- `backend/src/main/java/com/autonomousmower/logs/entity/RobotEvent.java`
- `backend/src/main/java/com/autonomousmower/logs/repository/RobotEventRepository.java`
- `backend/src/main/resources/db/migration/V5__create_robot_event.sql`

구현 내용:

- Frontend:
  - 개발 모드에서는 mock log 목록 사용
  - LogTimeline 표시
  - SnapshotViewer placeholder 존재
- Backend:
  - `/api/logs`
  - `logs:read` 권한 필요
  - robotId, severity, date range 필터 지원
  - MQTT status/event를 `robot_event`로 저장 후 조회 가능

Mock/Skeleton:

- 실제 snapshot binary 저장/조회 endpoint는 미구현이다.
- `SnapshotResponse` DTO는 있으나 controller endpoint는 확인되지 않는다.
- log text search 파라미터는 API contract 문서에는 있지만 현재 controller에는 없다.

### Control ownership

Frontend 주요 파일:

- `frontend/src/features/control/ControlPanel.tsx`
- `frontend/src/features/control/controlApi.ts`
- `frontend/src/features/control/controlStore.ts`
- `frontend/src/features/control/controlSelectors.ts`
- `frontend/src/features/control/types.ts`

Backend 주요 파일:

- `backend/src/main/java/com/autonomousmower/control/controller/ControlController.java`
- `backend/src/main/java/com/autonomousmower/control/service/ControlLockService.java`
- `backend/src/main/java/com/autonomousmower/control/model/ControlStateStore.java`
- `backend/src/main/java/com/autonomousmower/control/model/ControlLockSnapshot.java`

구현 내용:

- Claim control: `POST /api/control/{robotId}/claim`
- Release control: `POST /api/control/{robotId}/release`
- Takeover: `POST /api/control/{robotId}/takeover`
- lock state UI:
  - `none`
  - `requesting`
  - `held`
  - `held-by-other`
  - `expired`
  - `revoked`
- owner, mode, emergency state 표시
- backend는 in-memory `ControlStateStore` 기반 lock state 관리
- lock 변경 시 STOMP `/topic/robots/{robotId}/control-lock` publish

주의:

- control lock state는 현재 DB persistence가 아니라 backend process memory 기반이다.
- 다중 backend instance 환경에서는 분산 lock 또는 DB/Redis 기반 state가 필요하다.

### E-Stop

Frontend 주요 파일:

- `frontend/src/features/control/EmergencyStopButton.tsx`
- `frontend/src/features/control/controlApi.ts`
- `frontend/src/features/control/controlSelectors.ts`

Backend 주요 파일:

- `backend/src/main/java/com/autonomousmower/control/service/EmergencyStopService.java`
- `backend/src/main/java/com/autonomousmower/control/controller/ControlController.java`
- `backend/src/main/java/com/autonomousmower/mqtt/service/MqttCommandPublisher.java`

구현 내용:

- Header global E-Stop button 제공
- confirm dialog 후 `/api/control/{robotId}/estop` 호출
- active emergency 상태 표시
- reset endpoint: `/api/control/{robotId}/reset-after-emergency`
- E-Stop은 backend에서 MQTT `mowers/{robotId}/commands/estop`으로 publish
- E-Stop command QoS는 1
- reset은 backend state reset 중심이며 Jetson 실제 reset contract는 미구현/확인 필요

### Manual Joystick

Frontend 주요 파일:

- `frontend/src/features/control/ManualJoystick.tsx`
- `frontend/src/features/control/DeadmanSwitch.ts`
- `frontend/src/features/control/controlApi.ts`

Backend 주요 파일:

- `backend/src/main/java/com/autonomousmower/control/service/ControlCommandService.java`
- `backend/src/main/java/com/autonomousmower/mqtt/service/MqttCommandPublisher.java`

구현 내용:

- 방향 버튼:
  - `forward`
  - `left`
  - `stop`
  - `right`
  - `reverse`
- pointer down 시 manual command 전송
- pointer up/cancel 시 stop 전송
- blur/pagehide/beforeunload/visibility hidden 시 stop 시도
- command payload preview 표시
- backend manual command는 MQTT `mowers/{robotId}/commands/manual` QoS 0으로 publish

주의:

- docs MQTT contract는 manual direction 예시로 `backward`를 사용하지만 frontend type은 `reverse`를 사용한다. Jetson 구현 전 정합성 확인 필요.

### Deadman switch

Frontend:

- `frontend/src/features/control/DeadmanSwitch.ts`
- `frontend/src/features/control/ManualJoystick.tsx`
- timeout: 500ms
- manual command 이후 timer reset, timeout 시 stop command 호출

Backend:

- `backend/src/main/java/com/autonomousmower/control/service/DeadmanService.java`
- scheduled fixed rate: 100ms
- timeout: 500ms
- timeout 발생 시 system stop MQTT command publish
- `ControlEventPublisher.publishSyntheticStop()` 호출

주의:

- 브라우저 lifecycle stop은 보장되지 않기 때문에 backend/edge fail-safe가 더 중요하다.
- 실제 STM32 PWM neutral fail-safe는 이 저장소에 미구현이다.

### WebRTC VideoPanel

주요 파일:

- `frontend/src/features/video/components/VideoPanel.tsx`
- `frontend/src/features/video/WebRtcClient.ts`
- `frontend/src/features/video/signalingApi.ts`
- `frontend/src/features/video/videoStore.ts`
- `frontend/src/features/video/types.ts`

구현 내용:

- `Start Stream`, `Stop Stream`, `Reconnect`, `Snapshot` 버튼
- telemetry 권한 필요
- default quality policy:
  - min 15fps
  - 640x480
  - max 500kbps
- 실제 영상 연결:
  - 백엔드 `/api/video/{robotId}/offer`에서 WHEP URL과 세션 ID 발급
  - `WhepClient`가 MediaMTX에 SDP offer를 전송하고 H.264 WebRTC stream 수신
  - 중지 시 WHEP resource에 `DELETE`를 보내고 백엔드 세션 종료
  - 재연결 시 새 영상 세션과 WHEP 연결 생성
- mock signalling:
  - `VITE_ENABLE_MOCK_VIDEO=true`이면 mock 영상 세션 사용
- snapshot은 placeholder state만 생성

제한:

- Jetson 송출 프로세스는 영상 시청 여부와 무관하게 계속 실행된다.
- 영상 품질 정책 값은 세션 상태에 표시되지만 네트워크 상태에 따른 자동 품질 조정은 구현되지 않았다.
- ICE는 MediaMTX의 WHEP 구현을 사용하며 별도 trickle ICE API는 제공하지 않는다.
- 실제 snapshot binary 저장/조회는 미구현이다.

### API client/proxy/mock 처리

주요 파일:

- `frontend/src/shared/api/httpClient.ts`
- `frontend/src/shared/api/errors.ts`
- `frontend/src/shared/config/env.ts`
- `frontend/vite.config.mjs`

구현 내용:

- `httpClient`가 auth token을 Authorization Bearer로 첨부
- `env.ts`에서 Vite env 읽음:
  - `VITE_API_BASE_URL`
  - `VITE_WSS_URL`
  - `VITE_WEBRTC_SIGNALING_URL`
  - `VITE_ENABLE_MOCK_AUTH`
  - `VITE_ENABLE_MOCK_CONTROL`
  - `VITE_ENABLE_MOCK_ROBOTS`
  - `VITE_ENABLE_MOCK_REALTIME`
  - `VITE_ENABLE_MOCK_VIDEO`
- 기능별 API module이 개발 모드/mock flag에 따라 mock data 또는 REST API 사용

Mock 처리 예:

- `frontend/src/features/robots/api.ts`
- `frontend/src/features/history/api.ts`
- `frontend/src/features/logs/api.ts`
- `frontend/src/features/control/controlApi.ts`
- `frontend/src/features/video/signalingApi.ts`
- `frontend/src/features/map/zoneApi.ts`

### 테스트

Frontend test files:

- `frontend/src/shared/lib/permissions.test.ts`
- `frontend/src/features/control/controlSelectors.test.ts`
- `frontend/src/features/control/DeadmanSwitch.test.ts`
- `frontend/src/features/control/controlApi.test.ts`
- `frontend/src/features/video/videoStore.test.ts`
- `frontend/src/features/video/WebRtcClient.test.ts`
- `frontend/src/features/video/WhepClient.test.ts`
- setup: `frontend/src/test/setupTests.ts`
- helper stores: `frontend/src/test/testStores.ts`
- runner wrapper: `frontend/scripts/run-vitest.mjs`

명령:

```powershell
cd frontend
npm run test
npm run build
```

## 3. 백엔드 기능 목록

### Spring Boot 구조

주요 entry/config:

- `backend/src/main/java/com/autonomousmower/AutonomousMowerApplication.java`
- `backend/src/main/java/com/autonomousmower/config/SecurityConfig.java`
- `backend/src/main/java/com/autonomousmower/config/WebSocketConfig.java`
- `backend/src/main/java/com/autonomousmower/config/MqttConfig.java`
- `backend/src/main/java/com/autonomousmower/config/ClockConfig.java`
- `backend/src/main/resources/application.yml`
- build: `backend/build.gradle`

주요 package:

- `auth`: login, JWT, RBAC principal/permission
- `robot`: robot 목록/조회
- `workzone`: PostGIS Polygon 작업 구역
- `telemetry`: telemetry log entity/repository
- `history`: telemetry 기반 history 조회
- `logs`: robot event 조회
- `control`: control lock, command, E-Stop, deadman, command execution
- `mqtt`: MQTT transport, topic, inbound/outbound bridge
- `realtime`: STOMP topic publish/security
- `video`: WHEP 영상 세션 발급, 중지, 재연결과 상태 발행
- `common`: API response/error/exception

### JWT/RBAC

주요 파일:

- `backend/src/main/java/com/autonomousmower/config/SecurityConfig.java`
- `backend/src/main/java/com/autonomousmower/auth/security/JwtTokenProvider.java`
- `backend/src/main/java/com/autonomousmower/auth/security/JwtAuthenticationFilter.java`
- `backend/src/main/java/com/autonomousmower/auth/security/SecurityUser.java`
- `backend/src/main/java/com/autonomousmower/auth/security/RoleName.java`
- `backend/src/main/java/com/autonomousmower/auth/security/Permission.java`
- `backend/src/main/java/com/autonomousmower/auth/service/AuthService.java`
- `backend/src/main/java/com/autonomousmower/auth/controller/AuthController.java`

구현 내용:

- stateless session
- `/api/auth/login`, `/api/health`, actuator health/info, `/ws/**`는 HTTP security에서 permit
- 나머지 REST API는 authenticated 필요
- method security: `@EnableMethodSecurity`, `@PreAuthorize`
- JWT claim:
  - subject: admin id
  - name
  - role
  - permissions
- JWT secret은 `JWT_SECRET` 환경변수 필수
- password는 BCrypt 검증

주의:

- 현재 committed migration에는 admin seed가 없다. `admin_account` provision 방식은 별도 필요하다.

### REST API

구현 controller:

- Auth:
  - `POST /api/auth/login`
  - `GET /api/auth/me`
  - `backend/src/main/java/com/autonomousmower/auth/controller/AuthController.java`
- Robot:
  - `GET /api/robots`
  - `GET /api/robots/{robotId}`
  - `backend/src/main/java/com/autonomousmower/robot/controller/RobotController.java`
- Work Zone:
  - `GET /api/robots/{robotId}/work-zone`
  - `PUT /api/robots/{robotId}/work-zone`
  - `backend/src/main/java/com/autonomousmower/workzone/controller/WorkZoneController.java`
- History:
  - `GET /api/history?robotId=&from=&to=`
  - `backend/src/main/java/com/autonomousmower/history/controller/HistoryController.java`
- Logs:
  - `GET /api/logs?robotId=&from=&to=&severity=`
  - `backend/src/main/java/com/autonomousmower/logs/controller/LogController.java`
- Control:
  - `POST /api/control/{robotId}/claim`
  - `POST /api/control/{robotId}/release`
  - `POST /api/control/{robotId}/takeover`
  - `POST /api/control/{robotId}/manual`
  - `POST /api/control/{robotId}/mode`
  - `POST /api/control/{robotId}/stop`
  - `POST /api/control/{robotId}/attachment`
  - `POST /api/control/{robotId}/estop`
  - `POST /api/control/{robotId}/reset-after-emergency`
  - `backend/src/main/java/com/autonomousmower/control/controller/ControlController.java`
- Video:
  - `POST /api/video/{robotId}/offer`
  - `POST /api/video/{robotId}/stop`
  - `POST /api/video/{robotId}/reconnect`
  - `backend/src/main/java/com/autonomousmower/video/controller/VideoController.java`
- Health:
  - `backend/src/main/java/com/autonomousmower/health/HealthController.java`
- Mock realtime:
  - `backend/src/main/java/com/autonomousmower/realtime/controller/MockRealtimeController.java`

공통 응답:

- `backend/src/main/java/com/autonomousmower/common/api/ApiResponse.java`
- `backend/src/main/java/com/autonomousmower/common/api/ApiError.java`
- `backend/src/main/java/com/autonomousmower/common/exception/GlobalExceptionHandler.java`

### PostGIS Entity/Repository/Flyway

Migrations:

- `V1__enable_postgis.sql`: PostGIS extension 활성화
- `V2__create_core_domain_tables.sql`: `admin_account`, `robot`, `work_zone`, `telemetry_log`
- `V3__add_work_zone_version.sql`: work zone version/update timestamp
- `V4__seed_local_integration_data.sql`: 현재 `MOWER-01` robot만 seed
- `V5__create_robot_event.sql`: logs/event persistence
- `V6__create_command_execution.sql`: command ack lifecycle persistence

Entities:

- `backend/src/main/java/com/autonomousmower/auth/entity/Admin.java`
- `backend/src/main/java/com/autonomousmower/robot/entity/Robot.java`
- `backend/src/main/java/com/autonomousmower/workzone/entity/WorkZone.java`
- `backend/src/main/java/com/autonomousmower/telemetry/entity/TelemetryLog.java`
- `backend/src/main/java/com/autonomousmower/logs/entity/RobotEvent.java`
- `backend/src/main/java/com/autonomousmower/control/entity/CommandExecution.java`

Repositories:

- `AdminRepository`
- `RobotRepository`
- `WorkZoneRepository`
- `TelemetryLogRepository`
- `RobotEventRepository`
- `CommandExecutionRepository`

### History/Logs persistence

Telemetry persistence:

- MQTT telemetry inbound -> `MqttInboundHandler.handleTelemetry()`
- persistence -> `MqttInboundPersistenceService.persistTelemetry()`
- DB -> `telemetry_log`
- STOMP publish -> `/topic/robots/{robotId}/telemetry`

Status/event persistence:

- status inbound -> `robot_event`에 `status-update` event 저장
- event inbound -> `robot_event` 저장
- logs 조회 -> `/api/logs`

History:

- `telemetry_log`를 시간순 조회해 GeoJSON LineString 생성
- route distance/coverage/events는 현재 제한 구현

### WebSocket/STOMP

주요 파일:

- `backend/src/main/java/com/autonomousmower/config/WebSocketConfig.java`
- `backend/src/main/java/com/autonomousmower/realtime/security/StompJwtAuthenticationInterceptor.java`
- `backend/src/main/java/com/autonomousmower/realtime/service/RealtimePublisher.java`
- `backend/src/main/java/com/autonomousmower/realtime/service/RealtimeTopics.java`

Topic:

- `/topic/robots/{robotId}/telemetry`
- `/topic/robots/{robotId}/status`
- `/topic/robots/{robotId}/events`
- `/topic/robots/{robotId}/control-lock`
- `/topic/robots/{robotId}/control-events`
- `/topic/robots/{robotId}/video-status`

인증/권한:

- STOMP CONNECT에서 `Authorization: Bearer <token>` 필요
- robot topic subscribe는 `telemetry:read` 권한 필요

주의:

- HTTP security는 `/ws/**`를 permit하지만 STOMP inbound interceptor에서 CONNECT 인증을 수행한다.
- frontend의 실제 STOMP message store 반영은 추가 구현 필요.

### Control Lock

주요 파일:

- `ControlController.java`
- `ControlLockService.java`
- `ControlStateStore.java`
- `ControlLockSnapshot.java`
- `ControlRealtimeMapper.java`
- `ControlResponseFactory.java`

구현 내용:

- claim/release/takeover
- owner 검증
- lock state snapshot
- STOMP control-lock publish
- command response 생성

제약:

- in-memory store이다.
- process restart 시 control state는 사라진다.
- multi-instance 대응은 미구현이다.

### E-Stop

주요 파일:

- `EmergencyStopService.java`
- `MqttCommandPublisher.java`
- `ControlEventPublisher.java`

구현 내용:

- E-Stop active state 적용
- normal command 차단은 `state.requireNotEmergency()`로 일부 service에서 수행
- MQTT `commands/estop` QoS 1 publish
- reset-after-emergency로 backend state idle 복구
- reset 후 이전 command 자동 재개 없음

확인 필요:

- reset command를 edge/Jetson으로 전달하는 contract는 현재 미구현이다.

### Deadman timeout

주요 파일:

- `DeadmanService.java`

구현 내용:

- manual/stop command 기록
- 500ms timeout 기준
- 100ms 주기 scheduled evaluation
- timeout 시 system stop MQTT publish
- synthetic control event publish

주의:

- Jetson Edge Client의 500ms 로컬 timeout은 구현되어 있다.
- STM32 자체 TTL enforcement와 drive PWM 중립 복귀는 아직 구현 및 실장 검증이 필요하다.

### MQTT bridge

주요 파일:

- `backend/src/main/java/com/autonomousmower/config/MqttConfig.java`
- `backend/src/main/java/com/autonomousmower/mqtt/config/MqttBridgeProperties.java`
- `backend/src/main/java/com/autonomousmower/mqtt/transport/MqttTransport.java`
- `backend/src/main/java/com/autonomousmower/mqtt/transport/PahoMqttTransport.java`
- `backend/src/main/java/com/autonomousmower/mqtt/transport/NoopMqttTransport.java`
- `backend/src/main/java/com/autonomousmower/mqtt/service/MqttTopicResolver.java`
- `backend/src/main/java/com/autonomousmower/mqtt/service/MqttCommandPublisher.java`
- `backend/src/main/java/com/autonomousmower/mqtt/service/MqttInboundSubscriber.java`
- `backend/src/main/java/com/autonomousmower/mqtt/service/MqttInboundHandler.java`
- `backend/src/main/java/com/autonomousmower/mqtt/service/MqttInboundPersistenceService.java`

환경:

- `MQTT_ENABLED=false`이면 Noop transport 사용
- `MQTT_ENABLED=true`이면 Paho MQTT 사용
- broker URL 기본: `tcp://localhost:1883`

Outbound command topics:

- `mowers/{robotId}/commands/manual`
- `mowers/{robotId}/commands/stop`
- `mowers/{robotId}/commands/estop`
- `mowers/{robotId}/commands/mode`
- `mowers/{robotId}/commands/attachment`

Inbound topics:

- `mowers/+/telemetry`
- `mowers/+/status`
- `mowers/+/events`
- `mowers/+/commands/ack`

### Command ACK lifecycle

주요 파일:

- `CommandExecutionService.java`
- `CommandExecution.java`
- `CommandExecutionStatus.java`
- `CommandExecutionRepository.java`
- `V6__create_command_execution.sql`
- `MqttCommandAckPayload.java`

구현 내용:

- command publish 성공 후 `command_execution`에 `SENT` 저장
- ack 수신 시 status mapping:
  - `accepted`, `acked` -> `ACKED`
  - `executing` -> `EXECUTING`
  - `executed`, `completed` -> `COMPLETED`
  - `rejected`, `failed` -> `FAILED`
  - timeout variants -> `TIMED_OUT`
- 5초 timeout scheduler가 `SENT`, `ACKED`, `EXECUTING` 오래된 command를 `TIMED_OUT` 처리
- control-events STOMP topic publish

고도화 필요:

- idempotency duplicate handling은 DB index만 있고 실제 재사용/중복 응답 정책은 제한적이다.
- edge ack sequence를 실제 Jetson/STM32 확인 상태와 연결해야 한다.

### 환경변수/보안 설정

주요 파일:

- `.env.example`
- `backend/src/main/resources/application.yml`
- `docker-compose.yml`
- `README.md`

Backend env:

- `SERVER_PORT`
- `SPRING_DATASOURCE_URL`
- `SPRING_DATASOURCE_USERNAME`
- `SPRING_DATASOURCE_PASSWORD`
- `JWT_SECRET`
- `JWT_EXPIRATION`
- `MQTT_ENABLED`
- `MQTT_BROKER_URL`
- `MQTT_USERNAME`
- `MQTT_PASSWORD`
- `MQTT_CLIENT_ID`
- `VIDEO_WHEP_BASE_URL`

보안 상태:

- `.env`는 `.gitignore` 대상
- JWT secret은 runtime env 필수
- committed admin password seed 없음
- 공개 문서의 자격 증명 예시는 `<DB_USERNAME>`, `<DB_PASSWORD>`, `<JWT_SECRET>` placeholder를 사용한다.

Production 확인 필요:

- HTTPS/WSS/TLS termination
- MQTTS/TLS
- CORS/origin 제한
- real secret 관리
- admin credential provision 절차

### 테스트

Backend test files:

- domain/repository:
  - `DomainEntityTest.java`
  - `RepositoryContractTest.java`
- auth/security:
  - `AuthControllerTest.java`
  - `AuthServiceTest.java`
  - `SecurityAccessTest.java`
  - `StompJwtAuthenticationInterceptorTest.java`
- control:
  - `ControlSafetyServiceTest.java`
  - `ControlControllerSecurityTest.java`
  - `CommandExecutionServiceTest.java`
- mqtt:
  - `MqttTopicResolverTest.java`
  - `MqttInboundPersistenceServiceTest.java`
  - `MqttBridgeServiceTest.java`
- history/logs:
  - `HistoryServiceTest.java`
  - `LogServiceTest.java`
- realtime:
  - `RealtimePublisherTest.java`
- work zone:
  - `GeoJsonPolygonMapperTest.java`
- common/health:
  - `ApiResponseTest.java`
  - `HealthControllerTest.java`
  - `BackendPhase4ControllerTest.java`
- video:
  - `VideoControllerSecurityTest.java`
  - `VideoSessionServiceTest.java`

명령:

```powershell
cd backend
.\gradlew.bat test
```

## 4. MQTT/Edge Mock 기능 목록

### Topic 구조

문서:

- `docs/mqtt-topic-contract.md`

Backend topic resolver:

- `backend/src/main/java/com/autonomousmower/mqtt/service/MqttTopicResolver.java`

Edge Mock topic 정의:

- `tools/edge-mock-client/src/index.js`

Backend -> Edge:

- `mowers/{robotId}/commands/manual` QoS 0
- `mowers/{robotId}/commands/stop` QoS 1
- `mowers/{robotId}/commands/estop` QoS 1
- `mowers/{robotId}/commands/mode` QoS 1
- `mowers/{robotId}/commands/attachment` QoS 1

Edge -> Backend:

- `mowers/{robotId}/telemetry` QoS 1
- `mowers/{robotId}/status` QoS 1
- `mowers/{robotId}/events` QoS 1
- `mowers/{robotId}/commands/ack` QoS 1

### command 수신

Edge Mock:

- command topics subscribe:
  - manual QoS 0
  - mode/attachment/stop/estop QoS 1
- command 수신 시 JSON log 출력
- estop 수신 시 `emergency=true`, `lastMode="emergency"`
- stop 수신 시 emergency가 아니면 `lastMode="idle"`
- manual 수신 시 emergency가 아니면 `lastMode="manual"`
- mode 수신 시 emergency가 아니면 payload mode 반영

### telemetry/status/event publish

Edge Mock:

- telemetry:
  - 기본 1000ms 간격
  - latitude/longitude tick 증가
  - battery 감소 mock
  - emergency 상태면 `errorState="emergency-stop-active"`
- status:
  - 기본 3000ms 간격
  - emergency 상태면 degraded/emergency
- event:
  - 기본 15000ms 간격
  - `job-event`, `obstacle-detected`, `communication-lost`, `sensor-fault`, `estop` mock

Backend:

- telemetry persist + STOMP publish
- status persist as robot event + STOMP status publish
- event persist + STOMP event publish

### ack publish

Edge Mock:

- command payload가 object이고 commandId가 있으면 ack publish
- topic: `mowers/{robotId}/commands/ack`
- QoS: 1
- status: `accepted`
- edgeNodeId: mock client id
- receivedAt/ackedAt 현재 시간

Backend:

- ack 수신 후 `command_execution` update
- control-events STOMP publish
- unknown commandId ack는 warning 후 무시

### QoS 정책

현재 구현:

- manual command: QoS 0
- stop: QoS 1
- estop: QoS 1
- mode: QoS 1
- attachment: QoS 1
- telemetry/status/event/ack inbound: QoS 1

정책 근거:

- manual joystick은 stale queue 방지를 위해 best effort/latest-wins
- stop/E-Stop은 안전 명령이므로 at-least-once

## 5. 실행 방법 요약

### Docker Compose

```powershell
docker compose up -d postgres mosquitto
docker compose ps
```

확인:

```powershell
docker compose logs -f postgres
docker compose logs -f mosquitto
```

종료:

```powershell
docker compose down
```

볼륨까지 삭제:

```powershell
docker compose down -v
```

### Backend

```powershell
cd backend

$env:SERVER_PORT="8080"
$env:SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5432/mower"
$env:SPRING_DATASOURCE_USERNAME="<DB_USERNAME>"
$env:SPRING_DATASOURCE_PASSWORD="<DB_PASSWORD>"
$env:JWT_SECRET="<JWT_SECRET>"
$env:MQTT_ENABLED="true"
$env:MQTT_BROKER_URL="tcp://localhost:1883"

.\gradlew.bat bootRun
```

주의:

- 현재 committed migration은 admin 계정을 seed하지 않는다.
- 로그인 테스트 전 `admin_account`에 BCrypt password hash를 가진 계정을 별도 provision해야 한다.

### Frontend

```powershell
cd frontend

npm install
$env:VITE_API_PROXY_TARGET="http://localhost:8080"
$env:VITE_ENABLE_MOCK_AUTH="false"
$env:VITE_ENABLE_MOCK_CONTROL="false"
$env:VITE_ENABLE_MOCK_ROBOTS="false"
$env:VITE_ENABLE_MOCK_REALTIME="true"

npm run dev
```

접속:

```text
http://localhost:5173/login
```

### Edge Mock

```powershell
cd tools\edge-mock-client

npm install
$env:MQTT_BROKER_URL="mqtt://localhost:1883"
$env:ROBOT_ID="<ROBOT_ID>"
npm start
```

## 6. 현재 실제로 동작 확인된 것

README와 현재 구현 기준으로 확인 가능한 local integration flow:

- Frontend -> Backend REST API 호출 구조
- Backend -> MQTT command publish 구조
- MQTT Broker -> Edge Mock command delivery
- Edge Mock -> MQTT telemetry/status/event/ack publish
- Backend MQTT inbound subscribe/persistence/STOMP publish 구조

기능별 상태:

- Login:
  - Backend `/api/auth/login` 구현됨
  - Frontend login form/API 구현됨
  - 단, admin 계정 provision 필요
- Claim Control:
  - Frontend button/API 구현됨
  - Backend endpoint/service 구현됨
  - STOMP control-lock publish 구현됨
- Manual command:
  - Frontend joystick 구현됨
  - Backend REST -> MQTT manual QoS 0 구현됨
  - Edge Mock command 수신/ack 구현됨
- Stop command:
  - Frontend pointer up/deadman/lifecycle stop 시도 구현됨
  - Backend REST -> MQTT stop QoS 1 구현됨
  - Edge Mock stop 수신/ack 구현됨
- E-Stop:
  - Frontend confirm button 구현됨
  - Backend REST -> MQTT estop QoS 1 구현됨
  - Edge Mock emergency state 변경/ack 구현됨
- WebRTC 영상:
  - Jetson RealSense 640x480 약 15fps 원본 발행 확인
  - NVENC H.264 -> MediaMTX RTSP publish 확인
  - Backend 영상 세션 API와 video-status STOMP 발행 구현
  - Frontend WHEP 수신과 Chrome WebRTC 연결 확인
- Telemetry persistence:
  - Edge Mock telemetry publish
  - Backend `MqttInboundPersistenceService.persistTelemetry()`
  - DB `telemetry_log`
- History/Logs 조회:
  - History는 `telemetry_log` 기반 route 조회 구현
  - Logs는 `robot_event` 기반 조회 구현

최근 검증 명령:

- `.\gradlew.bat test` 통과
- `.\gradlew.bat test --tests "com.autonomousmower.video.*"` 통과
- `npm run test`: 39개 테스트 통과
- `npm run build` 통과
- `python -m unittest discover -s edge\jetson-video\tests -v`: 5개 테스트 통과
- `npm run build`에서 Vite chunk size warning은 발생하지만 build 실패는 아님

## 7. 아직 mock/skeleton/TODO인 것

### Jetson client 후속 범위

- Phase 1 구현됨: `edge/jetson-client/`
- MQTT command 구독, ROS 2 주행·안전 출력, ACK, telemetry/status 발행, 중복 억제, stale manual 차단, 로컬 deadman을 제공한다.
- STM32 serial bridge, attachment 실제 출력, 완전한 센서 telemetry 계산은 후속 구현이 필요하다.
- 실제 장비가 없는 로컬 통합 테스트에는 `tools/edge-mock-client/`를 계속 사용한다.

### STM32 serial bridge

- 미구현
- `docs/mqtt-topic-contract.md`에 draft line protocol만 있음
- 실제 UART framing/checksum/CRC/ACK/timeout 구현 필요

### WebRTC 영상 후속 범위

- 실제 media source, MediaMTX WHEP와 NVENC H.264 송출은 구현 및 장비 검증을 완료했다.
- 후속 구현:
  - 마지막 시청자가 중지하면 Jetson 인코더와 RTSP publisher도 실제 종료
  - 카메라, MediaMTX와 영상 송출기 systemd 자동 시작 및 장애 재시작
  - 실제 fps, bitrate, 해상도와 오류 상태 수집
  - 네트워크 상태별 해상도, fps와 bitrate 자동 조정
  - HTTPS/WSS, MediaMTX TLS와 필요 시 TURN 적용
  - Snapshot binary 저장/조회

### 실제 센서/GPS/IMU

- Jetson Edge Client는 GPS `/fix`와 IMU `/camera/imu` topic을 구독한다.
- GPS 수신값은 telemetry의 위도와 경도에 반영한다.
- IMU 기반 자세·속도 계산과 battery/signal 등 전체 telemetry 센서 연동은 아직 구현되지 않았다.
- Edge Mock 경로에서는 좌표와 상태를 synthetic publish한다.

### production 보안 설정

- 미구현/확인 필요:
  - HTTPS/WSS
  - MQTTS/TLS
  - CORS/origin 제한
  - secret manager
  - admin credential bootstrap/provision
  - broker auth/TLS
  - token rotation

### command ack 고도화

- 일부 구현:
  - `command_execution` 저장
  - ack 수신/timeout 처리
  - control-events publish
- 고도화 필요:
  - idempotency duplicate replay policy
  - edge accepted/executing/executed/failed sequence 확정
  - STM32 ack와 command completion 연결
  - stale manual command rejection reason 처리

### 다중 인스턴스 대응

- 미구현/확인 필요
- 현재 in-memory:
  - `ControlStateStore`
  - Deadman tracked robot set
- 다중 backend instance에서는 DB/Redis/distributed lock 또는 단일 safety authority 필요
- 관련 문서: `docs/backend-phase6-safety-notes.md`

### 추가 확인 필요

- Frontend route-level auth guard
- Work zone map drawing/editing UX
- Snapshot binary upload/storage/serving
- History distance/coverage/event aggregation
- MQTT contract의 `reverse` vs `backward` direction 정합성

## 8. 기능 시연 우선순위

시연까지 남은 기간에는 내부 구조 고도화보다 관람자가 화면에서 즉시 확인할 수 있는 흐름을 우선한다.

1. 실제 영상 재생 안정화
   - `run-video-demo.sh` 한 명령으로 카메라, MediaMTX와 송출기를 순서대로 실행하고 함께 종료하도록 구현했다.
   - `Start Stream`, `Stop Stream`, `Reconnect`를 반복해도 영상이 복구되는지 확인한다.
   - 영상 연결 실패 원인을 UI에 한국어로 표시한다.
2. 실시간 로봇 상태 시각화
   - 실제 Jetson telemetry와 status가 지도 위치, 배터리, 모드, 연결 상태에 즉시 반영되는지 검증한다.
   - 시연 중 값이 정지하면 명확한 통신 지연 또는 연결 끊김 상태를 표시한다.
3. 수동 주행과 긴급 정지 시연
   - 제어권 획득, 방향 제어, 데드맨 정지와 긴급 정지(E-Stop)가 화면과 실기체에서 같은 상태로 보이게 한다.
   - 긴급 정지 해제 후 재개 절차를 시연 전에 확정한다.
4. 지도와 주행 이력 시각화
   - 실제 위치 경로를 지도에 표시하고 시연 종료 후 History 화면에서 같은 이동 경로를 조회한다.
   - 현재 `0`으로 표시되는 거리와 커버리지 값은 실제 계산하거나 시연 화면에서 오해되지 않도록 구분한다.
5. 이벤트와 스냅샷
   - 장애물 또는 긴급 정지 이벤트가 Log Viewer에 즉시 나타나도록 한다.
   - 시간이 부족하면 Snapshot 저장보다 이벤트 발생과 로그 표시를 우선한다.

시연 이후로 미뤄도 되는 항목은 다중 백엔드 인스턴스, secret manager, 외부 인터넷용 TURN, 완전한 자동 화질 조정과 STM32 serial protocol 고도화다. 다만 긴급 정지와 데드맨 스위치처럼 실기체 안전에 직접 관련된 기능은 시연 범위에서도 생략하지 않는다.

상세한 다음 작업 순서, 실행 명령, 완료 기준과 차단 조건은 로컬 인계용 문서 `docs/learning/12-development-roadmap.md`에서 관리한다. 이 파일은 private note로 Git 추적에서 제외되므로, 인벤토리에는 현재 구현 상태와 시연 우선순위 요약만 유지한다.

## 9. GitHub 공유 전 주의사항

### 커밋 금지

- `.env`
- `.env.local`
- `.env.*.local`
- 실제 secret/token/password/private key/credential
- `node_modules/`
- `dist/`
- `build/`
- `.gradle/`
- runtime logs

현재 `.gitignore` 관련 항목:

- `.env`
- `.env.local`
- `.env.*.local`
- `!.env.example`
- `node_modules/`
- `**/node_modules/`
- `dist/`
- `**/dist/`
- `.gradle/`
- `**/.gradle/`
- `build/`
- `**/build/`
- `*.log`
- `**/integration-*.log`

### Secret 관리

- `.env.example`은 placeholder/example 전용이다.
- 실제 `JWT_SECRET`, DB password, MQTT password는 `.env` 또는 배포 환경 secret으로 관리한다.
- 현재 backend `application.yml`은 `SPRING_DATASOURCE_PASSWORD`, `JWT_SECRET`을 runtime env에서 요구한다.
- committed migration에 실제 admin password hash를 넣지 않는다.

### 공유 전 확인 명령

```powershell
git status --short
git status --short --ignored frontend/node_modules tools/edge-mock-client/node_modules frontend/dist frontend/build backend/build dist build node_modules
git ls-files -- node_modules dist build frontend/node_modules frontend/dist frontend/build backend/build tools/edge-mock-client/node_modules
```

민감 문자열 검색:

```powershell
rg -n -i "\.env|secret|password|token|jwt|key|credential" --glob "!**/node_modules/**" --glob "!**/dist/**" --glob "!**/build/**"
rg -n "(ghp_|github_pat_|sk-[A-Za-z0-9]|AKIA[0-9A-Z]{16}|-----BEGIN|xox[baprs]-|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)" --glob "!**/node_modules/**" --glob "!**/dist/**" --glob "!**/build/**"
```

테스트/빌드:

```powershell
cd backend
.\gradlew.bat test
```

```powershell
cd frontend
npm run test
npm run build
```

Edge Mock 최소 실행 확인:

```powershell
docker compose up -d postgres mosquitto
cd tools\edge-mock-client
npm start
```

## 10. 문서 인벤토리

기존 문서:

- `SRS.md`: 프로젝트 요구사항 원문. 현재 파일은 일부 환경에서 인코딩이 깨져 보일 수 있다.
- `docs/api-contract.md`: REST/STOMP/WebRTC contract 초안. 일부 항목은 추정 계약 또는 미구현 skeleton을 포함한다.
- `docs/backend-masterplan.md`: backend 설계/계획 문서. 일부 예시는 placeholder 값이다.
- `docs/backend-phase6-safety-notes.md`: safety authority, lock/deadman 관련 주의사항.
- `docs/development-log.md`: 개발 로그.
- `docs/frontend-masterplan.md`: frontend 설계/계획 문서.
- `docs/mqtt-topic-contract.md`: MQTT topic/payload/QoS contract. Edge Mock과 Backend 구현 기준.
- `docs/task-breakdown.md`: 작업 분해 문서.

이 문서:

- `docs/project-inventory.md`: 현재 코드 기준 기능 인벤토리와 온보딩 요약.
