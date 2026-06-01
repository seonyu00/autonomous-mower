# 프론트엔드 마스터플랜

본 문서는 `SRS.md`와 `AGENTS.md`를 근거로 자율주행 예초기 웹 관제 대시보드 프론트엔드 개발 계획을 정의한다. 현재 `docs/`, `frontend/`, `backend/` 디렉토리는 비어 있어 기존 구현 근거는 없으며, 구현 세부는 SRS 요구사항을 우선한다.

## 1. SRS 기반 전체 시스템 맥락

### 1.1 백엔드

- 중앙 서버는 Spring Boot 기반으로 가정한다. SRS에는 Spring Boot가 직접 상세 명시되어 있지 않지만, 프로젝트 구성 지침(`AGENTS.md`)에 Spring Boot가 포함되어 있다.
- 백엔드는 엣지 시스템에서 수신한 텔레메트리, 이벤트, 작업 상태, 에러 상태를 저장하고 웹 대시보드로 중계한다.
- 엣지 시스템과 서버 간 주요 상태 수신은 MQTT 기반이다.
- 웹 대시보드에는 WebSocket/STOMP 기반 브로드캐스트로 지도, 상태 패널, 주요 UI를 새로고침 없이 1초 단위로 갱신해야 한다.
- 텔레메트리 수신이 3초 이상 없으면 서버는 해당 로봇을 통신 두절 상태로 전환하고 대시보드에 경고를 표시해야 한다.
- 수동 제어 명령은 낮은 지연을 목표로 하며, 최대 50대 엣지 시스템이 1Hz 텔레메트리를 전송하는 부하에서도 End-to-End 200ms 이하를 목표로 한다.

### 1.2 DB/PostgreSQL/PostGIS

- SRS는 PostgreSQL 및 PostGIS 사용을 필수로 정의한다.
- `work_zone.zone_polygon`은 `GEOMETRY(Polygon, 4326)`로 저장되어야 한다.
- `telemetry_log.location_point`는 `GEOMETRY(Point, 4326)`로 저장되어야 한다.
- 프론트엔드는 작업 구역 Polygon 생성/수정, 이동 궤적 조회, 이력 조회 UI에서 PostGIS 공간 데이터와 호환되는 좌표 데이터를 REST API로 송수신해야 한다.
- 관리자는 날짜와 로봇 식별자 기준으로 과거 이동 궤적, 에러 발생 내역, 작업 이력을 검색 및 조회할 수 있어야 한다.

### 1.3 Jetson/STM32 하드웨어

- Jetson Orin은 상위 제어기로 센서 데이터 수집, 자율주행 알고리즘 실행, 위험 상황 판단, 작업 상태 관리 기능을 수행한다.
- STM32는 하위 제어기로 모터 드라이버, 엔진, 예초 장치, 승강 장치 등 실제 작업장치를 직접 제어한다.
- Jetson과 STM32 사이에는 시리얼 기반 명령/응답 구조, 패킷 포맷, 체크섬 검증, 비정상 패킷 거부, ACK, 재전송 및 동기화 기능이 필요하다.
- STM32는 50Hz 이상의 PWM 갱신 주기를 유지해야 하며, 상위 제어기 또는 원격 관제 장치와 0.5초 이상 통신이 끊기면 즉시 PWM 1.5ms 정지 상태로 전환해야 한다.
- 서버와 엣지 네트워크가 1.5초 이상 단절되면 엣지 하드웨어 킬 스위치가 릴레이 차단을 수행해야 한다.

### 1.4 MQTT/WebSocket/STOMP/WebRTC 통신

- 엣지 시스템과 서버 간 텔레메트리, 이벤트, 작업 상태, 제어 명령 전달은 MQTT 기반이다.
- 웹 대시보드와 백엔드 간 실시간 상태 갱신은 WSS 기반 WebSocket/STOMP로 처리한다.
- 모든 웹 구간 통신은 HTTPS/WSS를 사용해야 하며 엣지 단말은 MQTTS, TLS 1.2 이상을 사용해야 한다.
- 수동 조종 명령은 누적 급발진 방지를 위해 QoS 0, 최대 1회 즉시 폐기 정책을 적용해야 한다.
- E-Stop 및 텔레메트리 수신 데이터는 유실 방지를 위해 QoS 1 이상 정책이 필요하다.
- 온디맨드 실시간 영상 스트리밍은 WebRTC 기반으로 설계한다. SRS의 비기능 요구사항은 최소 15fps, 480p, 최대 500kbps, NVENC H.264/H.265 활용 및 네트워크 상태별 해상도/프레임 자동 조정을 요구한다.
- UI 설계 장에는 1080p @ 30fps 문구가 있으나 N-10은 최소 15fps/480p 및 500kbps 제한을 명시한다. 따라서 구현 기준은 N-10을 우선하고, 고품질 옵션은 네트워크 여건이 허용될 때의 확장으로 둔다.

### 1.5 웹 관제 프론트엔드 요구사항

- 다크 모드 기반 SPA 형태의 웹 대시보드가 요구된다.
- 화면 영역은 Header, LNB/Sidebar, 중앙 Map View, 원격 Control Panel, 우측 Telemetry & Status 영역으로 구성한다.
- Header에는 현재 시간, 관리자 프로필, 알림, MQTT/WSS/HTTPS 프로토콜 인디케이터가 필요하다.
- Sidebar에는 Map View, History, Log Viewer, Settings와 Robot List가 필요하다.
- 지도에는 위성 지도, 작업 구역 Polygon, 현재 위치, 이동 궤적, 장애물, E-Stop 발생 구역이 표시되어야 한다.
- 수동 제어 패널에는 D-pad 또는 동등 수준 가상 조이스틱, AUTO/MANUAL/HOME 모드 전환, E-STOP 버튼이 필요하다.
- 수동 조종 모드에서 500ms 이상 새 조작 입력이 없거나 브라우저 세션이 비정상 종료되면 속도 0 정지 명령을 발행해야 한다.
- 한 로봇의 수동 조종 권한은 한 명의 관리자에게만 부여되어야 하며, 네트워크 단절 또는 장시간 무입력 시 자동 해제되어야 한다.
- 상위 관리자는 타인의 제어권을 강제 회수할 수 있어야 한다.
- RBAC는 최소 조회 전용 사용자와 조작 권한 사용자를 구분해야 하며, 필요 시 상위 관리자 권한 확장이 가능해야 한다.
- 영상은 관리자가 필요할 때 요청하고, 비활성화 시 즉시 전송 중단되어야 한다.
- 장애물/치명적 오류 발생 시 전방 JPEG 스냅샷과 에러 로그가 서버로 전송되며, 프론트엔드는 이를 로그/상세 화면에서 조회할 수 있어야 한다.

## 2. React 중심 기술 스택

SRS에 프론트엔드 세부 라이브러리는 명시되어 있지 않으므로 아래 항목은 추정이다.

- React 19 + TypeScript: SPA 대시보드 구현.
- Vite: 개발 서버와 번들링.
- React Router: Map, History, Log Viewer, Settings 화면 라우팅.
- TanStack Query: REST API 서버 상태, 캐싱, 재시도, 낙관적 갱신 제한.
- Zustand: 로컬 UI 상태, 실시간 연결 상태, 제어권 상태, 조이스틱 입력 상태.
- STOMP 클라이언트(`@stomp/stompjs`) + WebSocket: WSS/STOMP 구독 및 명령 요청.
- WebRTC API: 온디맨드 영상 스트림 수신.
- 지도 라이브러리: MapLibre GL 또는 Leaflet 중 선택. 위성 지도/Polygon 편집/실시간 마커/궤적 표시가 필요하므로 MapLibre GL을 우선 검토한다.
- 지도 편집 보조: Polygon draw/edit 라이브러리. 선택 라이브러리는 구현 시점에 유지보수 상태를 확인한다.
- UI: 접근성 있는 컴포넌트 기반 라이브러리 또는 자체 컴포넌트. SRS의 다크 모드, 관제형 고밀도 UI에 맞게 카드 남용을 피하고 정보 스캔성을 우선한다.
- 테스트: Vitest, React Testing Library, Playwright. 안전 기능은 단위 테스트와 E2E 시나리오로 검증한다.
- 품질: ESLint, Prettier, TypeScript strict mode.

## 3. src 디렉토리 구조

```text
src/
  app/
    App.tsx
    routes.tsx
    providers/
      QueryProvider.tsx
      RealtimeProvider.tsx
      AuthProvider.tsx
  pages/
    MapViewPage.tsx
    HistoryPage.tsx
    LogViewerPage.tsx
    SettingsPage.tsx
    LoginPage.tsx
  features/
    auth/
      api.ts
      authStore.ts
      guards.tsx
      types.ts
    robots/
      api.ts
      robotStore.ts
      types.ts
    telemetry/
      stompTopics.ts
      telemetryStore.ts
      types.ts
    map/
      components/
      geojson.ts
      zoneApi.ts
      zoneStore.ts
      types.ts
    control/
      ControlPanel.tsx
      DeadmanSwitch.ts
      controlApi.ts
      controlStore.ts
      types.ts
    video/
      WebRtcClient.ts
      videoStore.ts
      types.ts
    history/
      api.ts
      types.ts
    logs/
      api.ts
      types.ts
  shared/
    api/
      httpClient.ts
      errors.ts
    realtime/
      stompClient.ts
      reconnectPolicy.ts
      topicRouter.ts
    ui/
      Button.tsx
      Dialog.tsx
      StatusBadge.tsx
      Toast.tsx
    config/
      env.ts
    lib/
      time.ts
      geometry.ts
      permissions.ts
```

## 4. 주요 컴포넌트 설계

- `AppShell`: Header, Sidebar, main content, status area 레이아웃.
- `ProtocolIndicators`: HTTPS/WSS/MQTT 상태 표시. MQTT는 웹이 직접 연결하지 않더라도 백엔드가 전달한 엣지 연결 상태로 표시한다.
- `RobotList`: 다수 로봇 목록, 현재 선택 로봇, 통신 두절/작업 중/오류 상태 표시.
- `MapCanvas`: 위성 지도, 현재 위치, 작업 구역 Polygon, 이동 궤적, 장애물, E-Stop 마커/영역 렌더링.
- `WorkZoneEditor`: 포인트 입력 기반 Polygon 생성/수정, 유효성 검사, 저장/취소.
- `TelemetryPanel`: 배터리, 모드, 작업 상태, 센서 상태, 좌표, 속도, 통신 신호 강도 표시.
- `LiveCameraPanel`: WebRTC 영상 요청/중단, 연결 상태, 네트워크 품질, 오류 상태 표시.
- `ControlPanel`: AUTO/MANUAL/HOME 전환, 제어권 요청/반납, 작업 시작/정지, 작업장치 구동/정지, 승강 제어.
- `ManualJoystick`: 방향/속도 입력, 500ms 데드맨 스위치, blur/pagehide/visibilitychange 시 정지 명령.
- `EmergencyStopButton`: 전역 고정 접근 가능한 E-Stop 액션. 모든 조작 화면에서 최우선 노출한다.
- `HistorySearch`: 날짜/로봇 기준 검색.
- `HistoryMapReplay`: 과거 이동 궤적 및 이벤트 재생.
- `LogTimeline`: 에러 로그, 장애물 감지, 통신 단절, 스냅샷 조회.
- `PermissionGate`: RBAC 기반 메뉴/버튼 표시와 명령 실행 차단.

## 5. 상태 관리 전략

- 서버 상태는 TanStack Query가 관리한다.
  - 로그인 사용자, 로봇 목록, 작업 구역, 이력, 로그, 설정 등 REST 기반 조회 데이터.
  - 명령 API는 mutation으로 정의하되 E-Stop은 별도 우선 경로를 둔다.
- 실시간 상태는 Zustand store에 저장한다.
  - `telemetryStore`: 로봇별 최신 위치, 배터리, 모드, 작업 상태, 오류 상태.
  - `robotStore`: 선택 로봇, 연결 상태, 통신 두절 여부.
  - `controlStore`: 제어권 보유자, 수동 조종 활성 여부, 마지막 입력 시각, E-Stop 상태.
  - `videoStore`: WebRTC 연결, 스트림 활성화, bitrate/fps 추정 상태.
- STOMP 수신 데이터는 topic router에서 정규화한 뒤 store에 반영한다.
- UI 파생 상태는 selector로 계산한다. 예: 조작 가능 여부 = 인증됨 + 권한 있음 + 제어권 있음 + 로봇 연결됨 + Emergency 아님.
- 안전 관련 상태는 UI 표시만으로 끝내지 않고 명령 발행 계층에서도 재검증한다.

## 6. REST/WebSocket/WebRTC 통신 모듈 설계

### 6.1 REST

예상 API는 SRS에 상세 엔드포인트가 없으므로 추정이다.

- `POST /api/auth/login`: 로그인, access token 수신.
- `GET /api/robots`: 로봇 목록.
- `GET /api/robots/{robotId}`: 로봇 상세.
- `GET /api/robots/{robotId}/work-zone`: 활성 작업 구역 조회.
- `PUT /api/robots/{robotId}/work-zone`: Polygon 작업 구역 저장.
- `GET /api/history?robotId=&from=&to=`: 이동 궤적/작업 이력 조회.
- `GET /api/logs?robotId=&from=&to=&severity=`: 이벤트/에러 로그 조회.
- `POST /api/control/{robotId}/claim`: 제어권 요청.
- `POST /api/control/{robotId}/release`: 제어권 반납.
- `POST /api/control/{robotId}/takeover`: 상위 관리자 제어권 강제 회수.
- `POST /api/control/{robotId}/estop`: E-Stop.
- `POST /api/video/{robotId}/offer`: WebRTC signaling 시작.
- `POST /api/video/{robotId}/stop`: 스트리밍 중단.

### 6.2 WebSocket/STOMP

- 연결은 `wss://.../ws`를 기본으로 한다.
- 토큰 인증은 백엔드 정책에 맞춰 STOMP connect headers 또는 쿠키 기반으로 적용한다.
- 예상 topic은 추정이다.
  - `/topic/robots/{robotId}/telemetry`
  - `/topic/robots/{robotId}/status`
  - `/topic/robots/{robotId}/events`
  - `/topic/robots/{robotId}/control-lock`
  - `/topic/robots/{robotId}/video-status`
- STOMP 연결 상태는 `connected`, `connecting`, `reconnecting`, `degraded`, `disconnected`로 관리한다.
- 텔레메트리는 1Hz 수신을 기준으로 하며, 3초 이상 미수신 시 UI에서 통신 두절 경고를 표시한다.

### 6.3 WebRTC

- 영상은 관리자가 명시적으로 요청할 때만 연결한다.
- WebRTC signaling 엔드포인트는 REST 또는 STOMP 중 백엔드 구현에 맞춘다. SRS에는 signaling 방식이 명시되어 있지 않으므로 추정이다.
- 연결 해제, 화면 이탈, 탭 비활성, 권한 상실 시 즉시 스트리밍 중단 요청을 보낸다.
- 네트워크 상태에 따라 해상도/프레임 조정을 표시하고, N-10의 최소 기준인 15fps/480p와 최대 전송률 500kbps 정책을 UI에 반영한다.

## 7. 예외 처리와 재연결 전략

- HTTPS REST 실패
  - 인증 실패: 로그인으로 이동 또는 토큰 갱신 시도.
  - 권한 실패: RBAC 안내와 액션 비활성화.
  - 명령 실패: 해당 명령 상태를 즉시 실패 처리하고 재시도는 사용자가 명시적으로 수행한다. 조이스틱 명령은 자동 재시도하지 않는다.
- WSS/STOMP 장애
  - 지수 백오프 + 최대 간격 제한으로 재연결한다.
  - 재연결 중에는 상태 패널을 `degraded`로 표시하고 수동 조종 신규 진입을 차단한다.
  - 이미 수동 조종 중 연결 이상이 감지되면 즉시 정지 명령 발행을 시도하고, UI는 제어권을 상실/위험 상태로 표시한다.
- 500ms 데드맨 스위치
  - 수동 입력이 500ms 이상 없으면 속도 0 정지 명령을 발행한다.
  - `pointerup`, `pointercancel`, `blur`, `visibilitychange`, `pagehide`, `beforeunload`에서 정지 명령을 발행한다.
  - 정지 명령 발행 실패 시 E-Stop 버튼과 통신 위험 경고를 최상위로 표시한다.
- E-Stop
  - 모든 화면에서 접근 가능해야 하며 일반 명령보다 우선한다.
  - E-Stop 해제 후 이전 주행 명령은 자동 재개하지 않고 대기 상태에서 명시적 재시작을 요구한다.
- WebRTC 장애
  - ICE 실패/타임아웃 시 스트림 중단 상태로 전환하고 재시작 버튼을 제공한다.
  - 영상 장애가 수동 제어 자체를 자동 허용하지 않도록 한다. 시야 정보가 필수인 운용 정책은 백엔드/운영 정책과 맞춘다.
- 제어권 장애
  - 제어권 보유자 연결 단절/무입력 시 서버의 자동 해제를 UI에 반영한다.
  - 상위 관리자만 강제 회수 버튼을 볼 수 있고 실행할 수 있다.

## 8. 4단계 구현 로드맵

### Phase 1. 기반 앱과 읽기 전용 관제

- React/Vite/TypeScript 프로젝트 생성.
- AppShell, Header, Sidebar, RobotList, StatusBadge 구현.
- 인증, RBAC 기본 구조 구현.
- REST http client와 TanStack Query 설정.
- WSS/STOMP 연결 모듈과 텔레메트리 store 구현.
- Map View에서 로봇 위치, 상태 패널, 연결 상태 표시.

### Phase 2. 지도/이력/로그 기능

- 위성 지도 렌더링 및 작업 구역 Polygon 표시.
- WorkZoneEditor로 작업 구역 생성/수정.
- 날짜/로봇 기준 주행 이력 조회.
- 이동 궤적 지도 표시와 이벤트 타임라인.
- 장애물, E-Stop 발생 지점, 스냅샷 로그 조회.

### Phase 3. 제어와 안전 기능

- 제어권 요청/반납/강제 회수 UI.
- ManualJoystick과 500ms 데드맨 스위치 구현.
- AUTO/MANUAL/HOME, 작업 시작/정지, 작업장치 구동/정지, 승강 제어.
- E-Stop 전역 액션과 해제 후 대기 상태 처리.
- WSS/STOMP 장애, 세션 종료, 탭 비활성 이벤트에 대한 fail-safe UI 처리.

### Phase 4. 영상, 운영 품질, 검증

- WebRTC 온디맨드 영상 요청/중단.
- 영상 품질 상태, 연결 장애, 대역폭 제한 표시.
- Playwright 기반 핵심 E2E: 로그인, 지도, Polygon 저장, 이력 조회, 제어권, 데드맨, E-Stop.
- 성능 검증: 1Hz 텔레메트리 다중 로봇 표시, UI 갱신 안정성.
- 배포 설정, 환경 변수, HTTPS/WSS 운영 구성 문서화.
