# 자율주행 예초기 프로젝트 온보딩 가이드

이 문서는 이 저장소를 처음 접하는 사람이 프로젝트의 목적, 실행 구조, 핵심 코드 흐름을 이해하기 위한 입문서다. 코드 구현을 설명할 때는 `SRS.md`의 목표와 현재 저장소에서 실제로 확인되는 구현을 구분한다.

기능별 상세 해설과 공개용 API·MQTT 예제는 [`docs/learning/README.md`](learning/README.md)에서 이어서 볼 수 있다. `<...>`로 표시한 값은 실제 로컬 환경값으로 교체해야 하는 placeholder다.

## 1. 먼저 알아야 할 것

이 프로젝트는 웹에서 예초기의 상태를 확인하고 원격 제어 명령을 보내는 관제 시스템이다. 전체 시스템은 다음 방향으로 연결된다.

```text
React Dashboard
  | REST: 로그인, 조회, 제어 요청
  | STOMP/WebSocket: 실시간 상태 수신
  v
Spring Boot Backend
  | JPA/Flyway
  v
PostgreSQL/PostGIS

Spring Boot Backend
  | MQTT: 제어 명령 발행
  v
Mosquitto Broker
  v
Jetson Edge Client 또는 Edge Mock
  | ROS 2 topic
  v
STM32 Bridge와 실제 구동 장치
```

현재 저장소에서 Spring Boot까지의 서버 기능과 MQTT 연동 골격은 상당 부분 구현되어 있다. Jetson 클라이언트도 MQTT 명령을 ROS 2 메시지로 바꾸는 단계까지 존재한다. 그러나 STM32 시리얼 브리지, 실제 모터 PWM, 예초 장치, 자율주행 알고리즘은 아직 완성된 상태가 아니다.

## 2. 구성 요소별 책임

### 프론트엔드

위치: `frontend/`

React 대시보드는 사용자가 보는 화면이다. 로그인, 로봇 선택, 지도, 상태 표시, 제어권(Control Lock), 수동 조작, 긴급 정지(E-Stop), 이력과 로그 화면을 제공한다.

주요 기술:

- React 19와 TypeScript
- Vite
- Zustand 상태 관리
- React Router
- MapLibre GL
- STOMP/WebSocket

주의할 점:

- 개발 환경의 로봇, 지도 경로, 이력, 로그, 영상 중 일부는 Mock 데이터에 의존한다.
- STOMP 연결 코드는 있지만 실제 수신 메시지를 Zustand store에 반영하는 연결은 아직 제한적이다.
- 로그인하지 않은 사용자의 화면 경로 접근을 차단하는 route guard가 현재 라우팅 구조에는 없다.

### 백엔드

위치: `backend/`

Spring Boot 백엔드는 사용자 권한과 로봇 상태를 검사하고, 데이터를 저장하며, 제어 명령을 MQTT로 전달하는 중앙 관제 서버다.

주요 책임:

- JWT 로그인과 역할 기반 접근 제어(RBAC)
- 로봇, 작업 구역, 텔레메트리(Telemetry), 이벤트, 명령 이력 저장
- PostGIS Point와 Polygon 처리
- REST 제어 요청 검증
- MQTT 명령 발행과 상태 수신
- STOMP 실시간 메시지 발행
- 제어권, 데드맨 스위치(Deadman Switch), 긴급 정지 상태 관리
- 명령 ACK lifecycle 추적

### PostgreSQL/PostGIS

위치:

- `docker-compose.yml`
- `backend/src/main/resources/db/migration/`

저장하는 주요 데이터:

| 테이블 | 역할 |
|---|---|
| `admin_account` | 관리자 계정과 비밀번호 해시 |
| `robot` | 관제 대상 로봇 |
| `work_zone` | SRID 4326 작업 구역 Polygon |
| `telemetry_log` | 위치 Point와 배터리·상태 이력 |
| `robot_event` | 상태 변경과 오류 이벤트 |
| `command_execution` | 명령 전송과 ACK 상태 |

### MQTT Broker

위치:

- `docker-compose.yml`
- `docker/mosquitto/mosquitto.conf`

Mosquitto는 백엔드와 Jetson 사이에서 메시지를 전달한다. 메시지를 해석하거나 안전 규칙을 판단하지는 않는다.

### Jetson Edge Client

위치: `edge/jetson-client/`

Jetson 클라이언트는 MQTT 명령을 받아 ROS 2 topic으로 변환한다. 현재 구현에는 다음 기능이 있다.

- 수동 명령을 `geometry_msgs/Twist`로 변환
- 정지 시 속도 0 발행
- E-Stop 시 속도 0, 긴급 모드, 엔진 차단 메시지 발행
- 오래된 수동 명령과 중복 명령 거부
- 500ms 수동 명령 timeout 시 로컬 정지
- GPS와 IMU topic 구독
- 텔레메트리와 상태 MQTT 발행
- 명령 ACK 발행

아직 실제 작업장치 제어와 STM32 시리얼 통신은 연결되지 않았다.

### Edge Mock

위치: `tools/edge-mock-client/`

실제 Jetson 없이 백엔드와 MQTT 통합 흐름을 시험하기 위한 Node.js 프로그램이다. 가짜 텔레메트리, 상태, 이벤트를 발행하고 백엔드 명령을 수신해 ACK를 보낸다.

## 3. 가장 중요한 데이터 흐름

### 텔레메트리 흐름

```text
Jetson 또는 Edge Mock
  -> mowers/{robotId}/telemetry
  -> Mosquitto
  -> MqttInboundSubscriber
  -> MqttInboundHandler
  -> MqttInboundPersistenceService
  -> telemetry_log
  -> RealtimePublisher
  -> /topic/robots/{robotId}/telemetry
  -> React Dashboard
```

읽을 파일 순서:

1. `edge/jetson-client/jetson_mower_client/main.py`
2. `backend/src/main/java/com/autonomousmower/mqtt/service/MqttInboundSubscriber.java`
3. `backend/src/main/java/com/autonomousmower/mqtt/service/MqttInboundHandler.java`
4. `backend/src/main/java/com/autonomousmower/mqtt/service/MqttInboundPersistenceService.java`
5. `backend/src/main/java/com/autonomousmower/realtime/service/RealtimePublisher.java`
6. `frontend/src/app/providers/RealtimeProvider.tsx`
7. `frontend/src/features/telemetry/telemetryStore.ts`

현재 마지막 프론트엔드 연결이 완성되지 않았다. `RealtimeProvider`의 status, event, control-lock callback이 비어 있고 telemetry callback도 store 갱신에 연결되지 않았다.

### 수동 제어 흐름

```text
ManualJoystick
  -> controlApi
  -> POST /api/control/{robotId}/manual
  -> ControlController
  -> ControlCommandService
  -> MqttCommandPublisher
  -> mowers/{robotId}/commands/manual (QoS 0)
  -> Jetson
  -> manual_to_twist()
  -> /cmd_vel
```

수동 명령은 오래된 입력이 쌓이지 않도록 QoS 0을 사용한다. 백엔드와 Jetson 모두 500ms 입력 공백에 대한 정지 방어를 가진다.

읽을 파일 순서:

1. `frontend/src/features/control/ManualJoystick.tsx`
2. `frontend/src/features/control/controlApi.ts`
3. `backend/src/main/java/com/autonomousmower/control/controller/ControlController.java`
4. `backend/src/main/java/com/autonomousmower/control/service/ControlCommandService.java`
5. `backend/src/main/java/com/autonomousmower/mqtt/service/MqttCommandPublisher.java`
6. `edge/jetson-client/jetson_mower_client/main.py`
7. `edge/jetson-client/jetson_mower_client/command_mapping.py`

### 긴급 정지 흐름

```text
EmergencyStopButton
  -> POST /api/control/{robotId}/estop
  -> EmergencyStopService
  -> commands/estop (QoS 1)
  -> Jetson emergency state
  -> /cmd_vel = 0
  -> /mower/set_mode = EMERGENCY
  -> /mower/engine = false
```

핵심 안전 규칙:

- E-Stop은 일반 명령보다 우선한다.
- E-Stop은 현재 제어권 보유 여부와 무관하게 실행할 수 있다.
- 긴급 상태에서는 수동·모드·작업장치 명령을 거부한다.
- 긴급 상태를 해제해도 이전 명령을 자동 재개하지 않는다.
- 현재 reset 요청은 백엔드 상태만 초기화하며 Jetson reset 명령 계약은 없다.

읽을 파일 순서:

1. `frontend/src/features/control/EmergencyStopButton.tsx`
2. `backend/src/main/java/com/autonomousmower/control/service/EmergencyStopService.java`
3. `backend/src/main/java/com/autonomousmower/control/model/ControlStateStore.java`
4. `edge/jetson-client/jetson_mower_client/main.py`
5. `edge/jetson-client/jetson_mower_client/hardware_safety.py`

### 명령 ACK 흐름

```text
백엔드 명령 발행
  -> command_execution: SENT
  -> Jetson 명령 수신
  -> commands/ack
  -> CommandExecutionService
  -> ACKED / EXECUTING / COMPLETED / FAILED / TIMED_OUT
  -> STOMP control-events
```

읽을 파일 순서:

1. `backend/src/main/java/com/autonomousmower/control/service/CommandExecutionService.java`
2. `backend/src/main/java/com/autonomousmower/control/entity/CommandExecution.java`
3. `edge/jetson-client/jetson_mower_client/command_ack.py`
4. `backend/src/main/java/com/autonomousmower/mqtt/service/MqttInboundHandler.java`

Jetson은 현재 주로 `accepted` ACK를 보낸다. 실제 STM32가 동작을 완료했다는 최종 확인과는 아직 연결되지 않았다.

## 4. 프론트엔드 파일 지도

### 시작 지점

| 파일 | 역할 |
|---|---|
| `frontend/src/main.tsx` | 전역 Provider를 조립하고 React 앱을 시작한다. |
| `frontend/src/app/routes.tsx` | `/login`, `/map`, `/history`, `/logs`, `/settings` 경로를 정의한다. |
| `frontend/src/layout/AppShell.tsx` | 헤더, 메뉴, 로봇 목록, 본문, 상태 패널을 배치한다. |

### 기능 모듈

| 폴더 | 역할 |
|---|---|
| `features/auth` | 로그인, 세션, 역할과 권한 |
| `features/robots` | 로봇 목록과 선택 로봇 |
| `features/telemetry` | 실시간 상태 store와 표시 |
| `features/control` | 제어권, 조이스틱, 모드, 작업장치, E-Stop |
| `features/map` | 지도, 경로, 작업 구역 Polygon |
| `features/history` | 과거 이동 경로와 작업 이력 |
| `features/logs` | 이벤트 로그와 스냅샷 UI |
| `features/video` | WebRTC 클라이언트와 영상 패널 |

## 5. 백엔드 파일 지도

백엔드는 기능별 package로 나뉜다.

| 패키지 | 역할 |
|---|---|
| `auth` | 로그인, JWT, 사용자 권한 |
| `robot` | 로봇 목록과 상세 조회 |
| `workzone` | PostGIS 작업 구역 |
| `telemetry` | 텔레메트리 엔티티와 저장소 |
| `history` | 위치 로그 기반 이력 조회 |
| `logs` | 이벤트 로그 조회 |
| `control` | 제어권과 안전 제어 |
| `mqtt` | MQTT 송수신과 topic 계약 |
| `realtime` | STOMP 메시지 발행과 인증 |
| `config` | Security, MQTT, WebSocket 설정 |
| `common` | 공통 응답과 예외 처리 |

Spring Boot 시작점은 `backend/src/main/java/com/autonomousmower/AutonomousMowerApplication.java`다.

일반적인 백엔드 요청은 다음 계층을 따른다.

```text
Controller -> Service -> Repository -> Database
```

제어 요청은 저장소 대신 MQTT 경로가 추가된다.

```text
Controller -> Control Service -> MqttCommandPublisher -> MQTT Broker
```

## 6. 로컬에서 실행하기

필요한 프로그램:

- Docker Desktop
- Java 21
- Node.js 20 이상
- PowerShell

### 1단계: PostgreSQL과 Mosquitto

저장소 루트에서 실행한다.

```powershell
docker compose up -d postgres mosquitto
docker compose ps
```

### 2단계: 백엔드

새 PowerShell에서 실행한다.

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

상태 확인:

```powershell
Invoke-RestMethod http://localhost:8080/actuator/health
```

현재 migration에는 관리자 계정이 자동 생성되지 않는다. 실제 로그인 전 `admin_account` 계정을 별도로 준비해야 한다.

### 3단계: Edge Mock

새 PowerShell에서 실행한다.

```powershell
cd tools\edge-mock-client
npm install

$env:MQTT_BROKER_URL="mqtt://localhost:1883"
$env:ROBOT_ID="<ROBOT_ID>"
npm start
```

이 터미널에서 백엔드가 보낸 명령과 Mock ACK를 확인할 수 있다.

### 4단계: 프론트엔드

새 PowerShell에서 실행한다.

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

접속 주소:

```text
http://localhost:5173/login
```

`VITE_ENABLE_MOCK_REALTIME=true`이면 실제 STOMP 연결 대신 Mock 연결 상태를 사용한다. 실제 WebSocket 흐름을 확인하려면 이를 `false`로 바꾸고 `VITE_WSS_URL=ws://localhost:8080/ws`를 설정해야 한다.

## 7. 초보자용 확인 실습

### 실습 1: 서비스가 살아 있는지 확인

목표:

- PostgreSQL과 Mosquitto 컨테이너가 실행 중인지 확인한다.
- 백엔드 health 응답을 확인한다.

```powershell
docker compose ps
Invoke-RestMethod http://localhost:8080/actuator/health
```

### 실습 2: 텔레메트리가 저장되는 흐름 관찰

1. PostgreSQL, Mosquitto, 백엔드, Edge Mock을 실행한다.
2. Edge Mock이 1초마다 telemetry를 발행하는지 로그를 확인한다.
3. 백엔드가 MQTT 메시지를 수신하는지 로그를 확인한다.
4. 데이터베이스에서 `telemetry_log` 행이 증가하는지 확인한다.

```powershell
docker exec autonomous-mower-postgres psql -U mower -d mower -c "select robot_id, battery_level, robot_state, recorded_at from telemetry_log order by recorded_at desc limit 5;"
```

### 실습 3: 제어 명령 전달 관찰

1. 로그인 후 제어권을 획득한다.
2. 수동 조이스틱 버튼을 누른다.
3. 백엔드 로그의 `Publishing MQTT command`를 확인한다.
4. Edge Mock 터미널의 `command-received` 로그를 확인한다.
5. `command_execution`에서 ACK 상태를 확인한다.

```powershell
docker exec autonomous-mower-postgres psql -U mower -d mower -c "select command_id, command_type, status, sent_at, acked_at from command_execution order by sent_at desc limit 10;"
```

### 실습 4: E-Stop 안전 규칙 읽기

실제 장비 없이 E-Stop 버튼을 누르는 것만으로 하드웨어 안전이 검증되지는 않는다. 먼저 다음 테스트와 코드를 읽는다.

- `backend/src/test/java/com/autonomousmower/control/service/ControlSafetyServiceTest.java`
- `edge/jetson-client/tests/test_hardware_safety.py`
- `edge/jetson-client/jetson_mower_client/hardware_safety.py`

## 8. 현재 구현 상태

### 구현된 핵심 골격

- React 관제 화면과 기능별 상태 관리
- Spring Boot REST API
- JWT와 RBAC
- PostgreSQL/PostGIS migration과 저장
- MQTT command와 telemetry/status/event/ACK 경로
- STOMP topic 발행
- 제어권, E-Stop, 백엔드 데드맨 정지
- Jetson MQTT 명령 처리와 ROS 2 Twist 변환
- Jetson 로컬 500ms 수동 명령 timeout
- Edge Mock 기반 로컬 통합 테스트

### Mock 또는 제한 구현

- 프론트엔드 지도 경로와 작업 구역 일부
- 개발 환경의 이력과 로그
- WebRTC signalling과 영상 표시
- 스냅샷 UI
- 실제 센서가 없는 환경의 telemetry 값
- Jetson의 배터리·속도·신호 세기

### 아직 구현되지 않은 주요 영역

- STM32 UART framing, checksum/CRC, ACK와 재전송
- STM32 모터 PWM과 0.5초 watchdog
- 실제 예초 날과 승강 장치 제어
- Jetson E-Stop reset 명령
- 실제 카메라 WebRTC 송출과 NVENC
- 스냅샷 업로드·저장·조회
- 지도에서 작업 구역 직접 그리기와 편집
- 자율주행 RL, CPP, 장애물 인지와 회피
- ROS 2 `.mcap` 데이터 기록
- 다중 백엔드 인스턴스의 분산 제어권
- 운영 환경 HTTPS/WSS/MQTTS와 secret 관리

## 9. 안전상 반드시 지켜야 할 규칙

이 시스템은 실제 구동 장치를 제어하므로 화면에서 버튼이 동작하는 것만으로 안전하다고 판단하면 안 된다.

1. 프론트엔드 권한 검사는 사용자 편의를 위한 사전 차단일 뿐이다. 백엔드와 엣지에서 다시 검증해야 한다.
2. E-Stop은 일반 주행·모드·작업장치 명령보다 항상 우선해야 한다.
3. E-Stop 해제 후 이전 속도나 작업장치 출력을 자동 재개하면 안 된다.
4. 수동 조종 메시지는 queue에 쌓지 않고 최신 명령만 사용해야 한다.
5. 브라우저 정지 요청은 전달 실패가 가능하므로 Jetson과 STM32에 독립 watchdog이 필요하다.
6. 실제 장비 시험 전에는 바퀴와 예초 날이 지면 또는 사람과 접촉하지 않는 시험 환경을 사용해야 한다.
7. Mock ACK는 실제 모터와 릴레이 동작 완료를 의미하지 않는다.

## 10. 문서를 읽는 권장 순서

1. `docs/ONBOARDING.md`
2. `SRS.md`
3. `docs/project-inventory.md`
4. `docs/api-contract.md`
5. `docs/mqtt-topic-contract.md`
6. `frontend/src/main.tsx`
7. `backend/src/main/java/com/autonomousmower/control/controller/ControlController.java`
8. `backend/src/main/java/com/autonomousmower/mqtt/service/MqttCommandPublisher.java`
9. `edge/jetson-client/jetson_mower_client/main.py`

`docs/task-breakdown.md`, `docs/frontend-masterplan.md`, `docs/backend-masterplan.md`, `docs/development-log.md`에는 작성 당시의 단계와 계획이 보존되어 있다. 현재 구현 여부는 `docs/project-inventory.md`와 최신 코드를 우선하고, 계약 문서는 인터페이스와 안전 규칙을 확인할 때 사용한다.

## 11. AI에게 질문하는 방법

전체 프로젝트 질문에는 다음 파일을 함께 제공하면 좋다.

- `.understand-anything/domain-graph.json`
- `docs/ONBOARDING.md`
- `SRS.md`

정확한 코드 분석이 필요할 때는 관련 파일도 지정한다.

좋은 질문 예:

```text
수동 조이스틱 명령이 React에서 Jetson /cmd_vel까지 전달되는 과정을
관련 파일과 함수 순서대로 설명해줘.
```

```text
E-Stop이 활성화된 상태에서 일반 명령이 차단되는 위치를
프론트엔드, 백엔드, Jetson으로 나누어 설명해줘.
```

```text
이 기능이 실제 구현인지 Mock인지 코드 근거를 들어 판단해줘.
```

AI의 설명도 항상 코드, 테스트, 실행 결과와 대조해야 한다. 특히 실제 장비 안전에 관한 판단을 AI 설명만으로 확정하면 안 된다.
