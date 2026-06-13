# 개발 로그

> 이 문서는 작업 시점의 상태를 시간순으로 보존한다. 과거 항목의 `미구현`, `skeleton`, phase 설명은 당시 상태이며, 현재 구현 여부는 `docs/project-inventory.md`와 실제 코드를 기준으로 확인한다.

## 2026-06-13

### 프론트 실시간 STOMP 상태 연동

- 새로고침 직후 `GET /api/control/{robotId}`로 현재 제어권, 모드와 긴급 정지(E-Stop) 상태를 먼저 복원하도록 구현했다.
- STOMP CONNECT frame에 JWT `Authorization` header를 전달하고, 재연결 시 telemetry, status, control-lock과 control-events topic을 다시 구독하도록 수정했다.
- 실시간 payload를 검증한 뒤 Zustand store에 반영하고, telemetry의 emergency 모드가 확인되면 프론트 제어 상태도 즉시 긴급 정지 상태로 전환하도록 했다.
- 명령의 접수, 거부, Jetson 전송, ACK, timeout과 실패 상태를 제어 화면에 표시하도록 추가했다.
- 백엔드 내부 `CommandExecutionStatus`가 WebSocket 계약과 다른 대문자 enum으로 노출되던 문제를 수정했다. 외부 이벤트에는 `sent-to-edge`, `edge-ack`, `edge-timeout`, `failed`를 사용한다.

### 실제 Jetson 통합 검증

- Mock realtime을 끈 프론트와 별도 백엔드를 실행하고 실제 JWT로 STOMP 연결을 검증했다.
- Jetson에서 전송된 telemetry의 `mode=emergency`, `workState=error`, `batteryLevel=100`, `errorState=emergency-stop-active`를 수신했다.
- status의 `connectionState=degraded`, `mqttState=connected`, `wssState=connected`, `edgeState=emergency`, `stale=false`를 수신했다.
- 현재 환경에서 브라우저 자동화 도구를 사용할 수 없어 화면 클릭 검증 대신 실제 STOMP protocol과 store 단위 테스트로 검증했다.

### 남은 안전 이슈

- 백엔드 제어권과 긴급 정지 상태는 메모리에만 보관되어 백엔드를 재시작하면 초기화된다.
- Jetson은 emergency 상태를 유지하고 일반 명령을 거부하지만, 백엔드가 재시작 직후 정상 명령을 발행할 수 있는 여지는 남아 있다.
- 다음 안전 작업에서는 백엔드 시작 시 Jetson 상태를 기준으로 제어 상태를 복구하거나, 상태가 확인될 때까지 일반 명령을 차단해야 한다.

## 2026-06-12

### 로컬 통합 실행과 방향 명령 검증

- Docker Desktop을 실행하고 PostgreSQL/PostGIS와 Mosquitto를 기동했다.
- Spring Boot 백엔드 health endpoint가 `UP`을 반환하는 것을 확인했다.
- 프론트엔드, 백엔드와 Edge Mock을 각각 별도 터미널에서 실행했다.
- 로컬 DB에만 통합 시험용 관리자 계정을 준비했다. 자격 증명은 문서와 Git에 기록하지 않는다.
- `MOWER-01` 제어권 획득 후 전진 명령을 REST로 전송했다.
- 백엔드가 `mowers/MOWER-01/commands/manual`로 MQTT 명령을 발행하고 Edge Mock이 ACK를 반환하는 흐름을 확인했다.
- 수동 명령 약 500ms 후 백엔드 데드맨 스위치(Deadman Switch)가 정지 명령을 발행하고 ACK를 받는 것을 확인했다.
- Edge Mock이 `accepted` ACK만 보내므로 명령 상태가 처음 `ACKED`가 된 뒤 완료 ACK 부재로 약 5초 후 `TIMED_OUT`이 되는 현재 동작을 재확인했다.
- 프론트엔드 테스트 24개, Jetson Python 테스트 14개와 백엔드 Gradle 테스트가 통과했다.
- 프론트엔드 production build가 성공했다. MapLibre를 포함한 큰 번들 chunk 경고는 남아 있다.

### 방향 버튼 비활성 원인

- Vite 개발 서버가 두 개 실행되어 이전 환경변수를 가진 프로세스가 `5173`, 새 프로세스가 `5174`를 사용하고 있었다.
- 브라우저가 이전 프로세스에 접속하면서 실제 STOMP 연결 실패 상태를 유지했고, `canControlRobot()`의 실시간 연결 검사가 방향 버튼을 차단했다.
- 중복 Vite 프로세스를 종료하고 다음 설정의 단일 프론트엔드를 `5173`에 실행해 상태를 정상화했다.
  - 실제 로그인 API 사용
  - 실제 제어 REST API 사용
  - 실제 로봇 API 사용
  - 프론트 실시간 상태만 Mock 사용
- 방향 버튼은 로봇 선택, 현재 사용자의 제어권 `held`, 실시간 상태 `mock` 또는 `connected`, 비상 정지 비활성, 전송 상태 정상 조건을 모두 만족해야 활성화된다.

### Tailscale Jetson 상태 확인

- Jetson Tailscale 주소 `100.92.7.56`에 ping과 SSH 22번 포트 연결이 가능한 것을 확인했다.
- SSH 사용자 `jangwoo`로 접속했다. 비밀번호는 저장소와 문서에 기록하지 않는다.
- Jetson 호스트명은 `jetson-mower`, 저장소 위치는 `/home/jangwoo/autonomous-mower`다.
- Jetson 저장소의 최근 확인 commit은 `747ddd2 fix(edge): E-Stop을 하드웨어 상태 머신과 연동`이다.
- `edge/jetson-client/config.yaml`은 Git에 추적되지 않는 로컬 파일이며 MQTT broker가 `mqtt://localhost:1883`으로 설정되어 있었다.
- Mosquitto는 개발 PC에서 실행되므로 Jetson 설정을 개발 PC의 Tailscale IP와 `1883` 포트로 변경해야 한다.
- 확인 당시 개발 PC Tailscale IP는 `100.124.51.102`였다. 실행 시 `tailscale ip -4`로 다시 확인해야 한다.
- 실제 Jetson을 연결할 때 동일한 `MOWER-01`을 사용하는 Edge Mock은 종료해야 한다.

### Jetson ROS 2와 영상 상태

- Foxglove Bridge가 `0.0.0.0:8765`에서 실행 중이었다.
- `mower_controller mower_node` 프로세스와 동일 이름의 ROS 2 노드가 두 개 존재했다. 중복 실행 원인을 확인하기 전까지 실제 구동 시험을 진행하지 않는다.
- `/cmd_vel`, `/cmd_vel_auto`, `/mower/current_status`, `/mower/engine`, `/mower/set_mode` topic이 존재했다.
- `/cmd_vel`에는 복수 publisher와 subscription이 있으며 Foxglove publisher는 `TRANSIENT_LOCAL`, 하드웨어 브릿지 subscription은 별도 QoS를 사용한다. Edge Client 실행 전 QoS 정합성을 다시 확인해야 한다.
- `jetson_mower_client`와 MQTT 연결 프로세스는 실행되지 않고 있었다.
- 카메라, image, compressed 또는 video ROS topic은 확인되지 않았다.
- 백엔드 영상 signalling controller와 Jetson WebRTC/NVENC 송출이 미구현이므로 현재 프론트 영상 패널은 실제 카메라 송출이 아니다.

### RealSense D455 재실행 확인

- HW 팀으로부터 RealSense D455 실행 명령을 전달받았다.
- `/opt/ros/humble/setup.bash`와 `/home/jangwoo/mower_ws/install/setup.bash`를 불러온 뒤 `/usr/local/lib/librealsense2.so.2.57.6`을 `LD_PRELOAD`하는 실행 방식이다.
- 목표 설정은 컬러·깊이 640x480, 15fps이며 pointcloud와 gyro/accel은 비활성화한다.
- 원격 확인 시 `realsense2_camera` 프로세스와 `/camera/camera` 노드는 실행 중이었다.
- `/camera/camera`는 영상 publisher 없이 `/parameter_events`와 `/rosout`만 발행했다.
- `lsusb`에 Intel RealSense 장치가 없었고 `/dev/video*`도 생성되지 않았다.
- `rs-enumerate-devices -s`는 `No device detected. Is it plugged in?`을 반환했다.
- `/camera/camera/color/image_raw`와 `/camera/camera/color/image_raw/compressed`는 존재하지 않았다.
- 현재 실패 지점은 WebRTC나 프론트가 아니라 D455 USB 장치 인식 단계다.
- 실행과 검증 절차는 `docs/learning/11-jetson-camera-video-flow.md`에 정리했다.

### RealSense D455 재연결 후 검증

- HW 팀이 카메라를 다시 연결한 뒤 `lsusb`에서 `Intel(R) RealSense(TM) Depth Camera 455`를 확인했다.
- `/camera/camera/color/image_raw`와 `/camera/camera/color/image_raw/compressed`에 각각 publisher가 존재했다.
- 원본 컬러 토픽에서 1280x720 `rgb8` 프레임을 직접 수신했다.
- 원본 컬러 토픽은 약 28fps, 약 85MB/s로 발행됐다.
- 실행 명령은 640x480 15fps를 요청하지만 실제 원본 프로파일은 1280x720 약 28fps로 적용되어 설정 불일치가 있다.
- 압축 컬러 토픽은 약 30Hz로 발행되지만 평균 메시지 크기가 약 80바이트이고 JPEG `data`가 비어 있었다.
- 카메라 USB 연결과 원본 프레임 발행은 확인됐지만 압축 스트림과 웹 WebRTC 연결은 아직 완료되지 않았다.

### 실제 Jetson 방향 제어 E2E 검증

- `MOWER-01` Edge Mock을 종료하고 Jetson `config.yaml`의 MQTT broker를 개발 PC Tailscale 주소로 변경했다.
- Jetson에서 개발 PC Mosquitto `1883` 포트 연결과 `jetson-MOWER-01` MQTT client 접속을 확인했다.
- Jetson Edge Client가 telemetry와 status를 발행해 DB에 배터리 기본값 `100`, 상태 `IDLE`이 1초 주기로 저장되는 것을 확인했다.
- `/cmd_vel` publisher와 HW Bridge subscriber가 `RELIABLE`, `VOLATILE` QoS로 연결되는 것을 확인했다.
- 백엔드가 보내는 나노초 9자리 ISO 시각을 Jetson Python 3.10의 `datetime.fromisoformat()`이 처리하지 못해 정상 수동 명령도 `stale-command`로 거부하는 원인을 확인했다.
- ISO 소수초를 마이크로초 6자리로 정규화하도록 수정하고 Jetson Python 3.10에서 회귀 테스트를 통과시켰다.
- ROS setup script를 `set -u` 상태에서 불러올 때 `AMENT_TRACE_SETUP_FILES` 오류가 발생하므로 ROS setup 이후 `nounset`을 활성화하도록 실행 순서를 수정했다.
- 전진 명령을 100ms 간격으로 전송했을 때 `/cmd_vel linear.x=0.6`이 반복 발행되고 입력 중단 후 zero `Twist`가 발행되는 것을 확인했다.
- E-Stop 명령으로 `/cmd_vel` zero `Twist`, `/mower/set_mode=2`, `/mower/engine=false`가 함께 발행되는 것을 확인했다.
- E-Stop 이후 telemetry의 로봇 상태가 `ERROR`로 저장되는 것을 확인했다.
- Jetson의 `accepted` ACK는 DB에 저장되지만 최종 완료 ACK가 없어 약 5초 뒤 `TIMED_OUT`으로 바뀌는 현재 lifecycle을 재확인했다.
- Windows 개발 PC 시각이 공인 NTP보다 약 1.3초 빠르고 동기화되지 않은 상태라 `sent_at`과 Jetson `receivedAt` 기반 지연값이 음수가 된다. 관리자 권한으로 Windows Time 재동기화가 필요하다.
- 만료된 제어권에서 `requireOwner()`가 만료를 갱신하지 않은 채 통과하고 뒤의 `snapshot()`에서 `expired`로 바뀌어 명령이 한 번 발행될 수 있는 백엔드 검증 순서 문제를 발견했다.
- `requireOwner()`가 소유권 검사 전에 현재 시각으로 만료 상태를 갱신하도록 수정하고, 6분 전에 획득한 제어권으로 명령을 승인할 수 없는 회귀 테스트를 추가했다.
- 최종 확인 시 D455 USB 장치는 인식됐지만 `realsense2_camera` 프로세스와 컬러 영상 토픽은 실행되지 않았다. 카메라 재기동과 프로파일 정상화는 로드맵 우선순위 3에서 이어간다.

## 2026-06-06

### 문서와 현재 구현 정합성 갱신

- MQTT 계약 문서에 현재 Jetson Edge Client 구현과 검증 대상을 반영했다.
- 백엔드 데드맨 스위치와 긴급 정지가 MQTT 및 Jetson 로컬 안전 출력까지 연결된 현재 범위를 정리했다.
- 프로젝트 인벤토리에 `edge/jetson-client/`의 구현 범위와 STM32·센서 연동의 남은 제한을 반영했다.
- 구현 전 계획 문서는 역사적 계획임을 표시해 현재 상태 문서와 구분했다.

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
