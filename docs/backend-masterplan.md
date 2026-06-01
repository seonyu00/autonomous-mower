# 백엔드 마스터플랜

이 문서는 `SRS.md`와 `docs/api-contract.md`를 기준으로 Spring Boot 백엔드 구현 방향을 정의한다. 정확한 REST 경로, STOMP topic, WebRTC signalling payload 중 SRS에 명시되지 않은 부분은 `docs/api-contract.md`의 프론트엔드 계약을 따른다. 해당 계약 자체가 SRS에서 직접 지정되지 않은 경우는 본 문서에서도 "추정"으로 표시한다.

## 1. 백엔드 범위

백엔드는 다음 책임을 가진다.

- React 관제 대시보드용 REST API 제공
- JWT 기반 인증과 RBAC 권한 검증
- PostgreSQL/PostGIS 기반 로봇, 작업 구역, 텔레메트리, 이력, 로그 저장
- WebSocket/STOMP 기반 실시간 텔레메트리(Telemetry)/status/event/control-lock/video-status 전파
- MQTT 기반 Jetson/STM32 계층과의 텔레메트리(Telemetry) 수신 및 command 송신
- 긴급 정지(E-Stop), 500ms 데드맨 스위치(Deadman Switch), 제어권(Control Lock) 등 안전 제어 규칙의 서버 측 강제
- WebRTC video stream 시그널링 중계
- Docker Compose 기반 로컬/통합 실행 환경 제공

## 2. 권장 기술 스택

- Java 21
- Spring Boot 3.x
- Spring Web
- Spring Security
- Spring Validation
- Spring Data JPA
- Hibernate Spatial
- PostgreSQL Driver
- Flyway
- WebSocket/STOMP
- Spring Integration MQTT 또는 Eclipse Paho 기반 MQTT client
- Jackson
- JTS `org.locationtech.jts`
- JWT library: Nimbus JOSE JWT 또는 JJWT
- Actuator
- Testcontainers
- JUnit 5

추정:
- SRS는 Spring Boot, PostgreSQL/PostGIS, MQTT, WebSocket/STOMP, WebRTC를 요구하지만 Java/Spring Boot 세부 버전은 명시하지 않는다.
- Java 21과 Spring Boot 3.x는 장기 유지보수성과 Hibernate Spatial/PostGIS 호환성을 고려한 권장안이다.

## 3. 패키지 구조

```text
src/main/java/com/autonomousmower/
  AutonomousMowerApplication.java

  common/
    api/
      ApiError.java
      ApiResponse.java
      PageResponse.java
    exception/
      GlobalExceptionHandler.java
      BusinessException.java
      ErrorCode.java
    security/
      CurrentUser.java
      SecurityUser.java
      Permission.java
      RoleName.java
    time/
      TimeProvider.java

  config/
    SecurityConfig.java
    JwtConfig.java
    WebSocketConfig.java
    MqttConfig.java
    JpaConfig.java
    JacksonConfig.java
    CorsConfig.java
    OpenApiConfig.java

  auth/
    controller/
      AuthController.java
    dto/
      LoginRequest.java
      LoginResponse.java
      UserProfileResponse.java
    entity/
      AdminAccount.java
      Role.java
      AccountRole.java
    repository/
      AdminAccountRepository.java
      RoleRepository.java
    security/
      JwtTokenProvider.java
      JwtAuthenticationFilter.java
      RbacService.java
      StompAuthChannelInterceptor.java
    service/
      AuthService.java

  robot/
    controller/
      RobotController.java
    dto/
      RobotResponse.java
      RobotStatusResponse.java
    entity/
      Robot.java
      RobotStatus.java
    repository/
      RobotRepository.java
      RobotStatusRepository.java
    service/
      RobotService.java

  workzone/
    controller/
      WorkZoneController.java
    dto/
      WorkZoneRequest.java
      WorkZoneResponse.java
      GeoJsonPolygonDto.java
    entity/
      WorkZone.java
    repository/
      WorkZoneRepository.java
    service/
      WorkZoneService.java
      GeoJsonGeometryMapper.java

  telemetry/
    dto/
      TelemetryMessage.java
      TelemetryResponse.java
    entity/
      TelemetryLog.java
    repository/
      TelemetryLogRepository.java
    service/
      TelemetryIngestionService.java
      TelemetryQueryService.java

  history/
    controller/
      HistoryController.java
    dto/
      RobotHistoryResponse.java
      TrackPointResponse.java
      HistoryEventResponse.java
    service/
      HistoryService.java

  logs/
    controller/
      LogController.java
    dto/
      LogEntryResponse.java
      LogQuery.java
      SnapshotResponse.java
    entity/
      RobotEvent.java
      Snapshot.java
    repository/
      RobotEventRepository.java
      SnapshotRepository.java
    service/
      LogService.java
      SnapshotService.java

  control/
    controller/
      ControlController.java
    dto/
      ClaimControlRequest.java
      ControlLockResponse.java
      ChangeModeRequest.java
      ManualCommandRequest.java
      StopCommandRequest.java
      EmergencyStopRequest.java
      AttachmentCommandRequest.java
      ControlCommandResponse.java
    entity/
      ControlLock.java
      ControlCommand.java
    repository/
      ControlLockRepository.java
      ControlCommandRepository.java
    safety/
      ControlPrecheckService.java
      ControlLockService.java
      DeadmanWatchdog.java
      EmergencyStopService.java
      CommandSequencer.java
    service/
      ControlCommandService.java

  realtime/
    dto/
      StatusMessage.java
      RobotEventMessage.java
      ControlLockMessage.java
      VideoStatusMessage.java
    service/
      StompPublisher.java
      RobotTopicService.java

  mqtt/
    dto/
      MqttTelemetryPayload.java
      MqttStatusPayload.java
      MqttEventPayload.java
      MqttCommandPayload.java
      MqttAckPayload.java
    service/
      MqttInboundHandler.java
      MqttCommandPublisher.java
      MqttTopicResolver.java
      MqttAckService.java

  video/
    controller/
      VideoSignallingController.java
    dto/
      StartStreamRequest.java
      StartStreamResponse.java
      StopStreamResponse.java
      ReconnectStreamResponse.java
      IceCandidateDto.java
      VideoPolicyDto.java
    entity/
      VideoSession.java
    repository/
      VideoSessionRepository.java
    service/
      VideoSignallingService.java
      VideoSessionService.java
      SnapshotCaptureService.java
```

## 4. 주요 도메인 및 엔티티 설계

### 4.1 인증(Auth) 및 RBAC

`AdminAccount`
- `id`
- `username`
- `passwordHash`
- `displayName`
- `enabled`
- `createdAt`
- `updatedAt`

`Role`
- `id`
- `name`: `read-only`, `operator`, `supervisor`, `admin`
- `permissions`: enum collection or normalized table

`AccountRole`
- account to role mapping

권한 모델:
- `robots:read`
- `telemetry:read`
- `history:read`
- `logs:read`
- `settings:read`
- `control:write`
- `control:takeover`
- `settings:write` 추정
- `work-zone:write` 추정
- `video:read` 추정

추정:
- `docs/api-contract.md`는 `video:read`, `work-zone:write`를 open decision으로 둔다. 백엔드는 이를 명시 권한으로 분리하는 방향을 권장한다.

### 4.2 Robot

`Robot`
- `id`
- `name`
- `serialNumber`
- `model`
- `enabled`
- `createdAt`
- `updatedAt`

`RobotStatus`
- `robotId`
- `mode`: `idle`, `manual`, `autonomous`, `home`, `emergency`
- `workState`: `idle`, `mowing`, `paused`, `error`
- `batteryLevel`
- `lastLocation`: PostGIS `Point`, SRID 4326
- `heading`
- `speed`
- `realtimeState`: `connected`, `degraded`, `disconnected`
- `transportSecurityState`: `secure`, `insecure`, `unknown`
- `lastTelemetryAt`
- `lastStatusAt`
- `updatedAt`

### 4.3 작업 구역(Work Zone)

`WorkZone`
- `id`
- `robotId`
- `name`
- `zonePolygon`: PostGIS `Polygon`, SRID 4326
- `version`
- `createdBy`
- `updatedBy`
- `createdAt`
- `updatedAt`

SRS 근거:
- `WorkZone`은 `org.locationtech.jts.geom.Polygon zonePolygon` 구조를 가진다.
- PostGIS Polygon 작업 구역이 요구된다.

### 4.4 텔레메트리(Telemetry) 및 이력

`TelemetryLog`
- `id`
- `robotId`
- `recordedAt`
- `locationPoint`: PostGIS `Point`, SRID 4326
- `batteryLevel`
- `heading`
- `speed`
- `mode`
- `workState`
- `rawPayload`: JSONB

SRS 근거:
- `TelemetryLog`는 `org.locationtech.jts.geom.Point locationPoint`, `batteryLevel`, `robotState`를 포함한다.

History API는 별도 entity보다 `TelemetryLog`와 `RobotEvent`를 시간 범위로 조합해 응답한다.

### 4.5 로그 및 스냅샷

`RobotEvent`
- `id`
- `robotId`
- `occurredAt`
- `severity`: `info`, `warning`, `critical`
- `type`
- `message`
- `snapshotId`
- `rawPayload`: JSONB

`Snapshot`
- `id`
- `robotId`
- `capturedAt`
- `contentType`
- `storagePath`
- `source`: `video`, `event`, `manual`
- `metadata`: JSONB

추정:
- SRS는 로그/스냅샷 상세 schema를 명시하지 않는다. 프론트엔드 Log Viewer와 `docs/api-contract.md`의 snapshot placeholder를 기준으로 설계한다.

### 4.6 제어(Control)

`ControlLock`
- `robotId`
- `state`: `none`, `requesting`, `held`, `held-by-other`, `expired`, `revoked`
- `ownerAccountId`
- `ownerSessionId`
- `expiresAt`
- `lastHeartbeatAt`
- `version`
- `updatedAt`

`ControlCommand`
- `id`
- `robotId`
- `requestedBy`
- `type`: `claim`, `release`, `takeover`, `mode`, `manual`, `stop`, `estop`, `reset-after-emergency`, `attachment`
- `payload`: JSONB
- `priority`: `normal`, `stop`, `emergency`
- `status`: `accepted`, `rejected`, `sent`, `acked`, `failed`, `expired`
- `sequenceNo`
- `idempotencyKey`
- `createdAt`
- `sentAt`
- `ackedAt`
- `errorMessage`

Safety state is not only persisted. It must also be held in a transactional service layer to guarantee command ordering and E-Stop priority.

### 4.7 영상(Video)

`VideoSession`
- `id`
- `robotId`
- `requestedBy`
- `state`: `starting`, `connected`, `reconnecting`, `failed`, `stopped`
- `peerConnectionId`
- `policyFps`
- `policyResolution`
- `policyBitrateKbps`
- `createdAt`
- `updatedAt`
- `closedAt`

추정:
- SRS는 WebRTC를 요구하지만 백엔드 시그널링 영속성은 정의하지 않는다. 이 테이블은 관측성과 재연결 처리를 지원한다.

## 5. PostgreSQL/PostGIS 스키마

Flyway migrations should own schema evolution. Baseline migration:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

핵심 테이블:

```sql
CREATE TABLE admin_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username varchar(80) NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,
  display_name varchar(120) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE role (
  id bigserial PRIMARY KEY,
  name varchar(40) NOT NULL UNIQUE,
  permissions jsonb NOT NULL
);

CREATE TABLE account_role (
  account_id uuid NOT NULL REFERENCES admin_account(id),
  role_id bigint NOT NULL REFERENCES role(id),
  PRIMARY KEY (account_id, role_id)
);

CREATE TABLE robot (
  id varchar(64) PRIMARY KEY,
  name varchar(120) NOT NULL,
  serial_number varchar(120) UNIQUE,
  model varchar(120),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE robot_status (
  robot_id varchar(64) PRIMARY KEY REFERENCES robot(id),
  mode varchar(40) NOT NULL,
  work_state varchar(40) NOT NULL,
  battery_level integer,
  last_location geometry(Point, 4326),
  heading double precision,
  speed double precision,
  realtime_state varchar(40) NOT NULL,
  transport_security_state varchar(40) NOT NULL,
  last_telemetry_at timestamptz,
  last_status_at timestamptz,
  updated_at timestamptz NOT NULL
);

CREATE TABLE work_zone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  robot_id varchar(64) NOT NULL REFERENCES robot(id),
  name varchar(120) NOT NULL,
  zone_polygon geometry(Polygon, 4326) NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES admin_account(id),
  updated_by uuid REFERENCES admin_account(id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE telemetry_log (
  id bigserial PRIMARY KEY,
  robot_id varchar(64) NOT NULL REFERENCES robot(id),
  recorded_at timestamptz NOT NULL,
  location_point geometry(Point, 4326),
  battery_level integer,
  heading double precision,
  speed double precision,
  mode varchar(40),
  work_state varchar(40),
  raw_payload jsonb
);

CREATE TABLE robot_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  robot_id varchar(64) NOT NULL REFERENCES robot(id),
  occurred_at timestamptz NOT NULL,
  severity varchar(20) NOT NULL,
  type varchar(80) NOT NULL,
  message text NOT NULL,
  snapshot_id uuid,
  raw_payload jsonb
);

CREATE TABLE snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  robot_id varchar(64) NOT NULL REFERENCES robot(id),
  captured_at timestamptz NOT NULL,
  content_type varchar(80) NOT NULL,
  storage_path text NOT NULL,
  source varchar(40) NOT NULL,
  metadata jsonb
);

ALTER TABLE robot_event
  ADD CONSTRAINT fk_robot_event_snapshot
  FOREIGN KEY (snapshot_id) REFERENCES snapshot(id);

CREATE TABLE control_lock (
  robot_id varchar(64) PRIMARY KEY REFERENCES robot(id),
  state varchar(40) NOT NULL,
  owner_account_id uuid REFERENCES admin_account(id),
  owner_session_id varchar(160),
  expires_at timestamptz,
  last_heartbeat_at timestamptz,
  version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL
);

CREATE TABLE control_command (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  robot_id varchar(64) NOT NULL REFERENCES robot(id),
  requested_by uuid REFERENCES admin_account(id),
  type varchar(60) NOT NULL,
  payload jsonb NOT NULL,
  priority varchar(20) NOT NULL,
  status varchar(40) NOT NULL,
  sequence_no bigint NOT NULL,
  idempotency_key varchar(120),
  created_at timestamptz NOT NULL,
  sent_at timestamptz,
  acked_at timestamptz,
  error_message text
);

CREATE TABLE video_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  robot_id varchar(64) NOT NULL REFERENCES robot(id),
  requested_by uuid REFERENCES admin_account(id),
  state varchar(40) NOT NULL,
  peer_connection_id varchar(160),
  policy_fps integer NOT NULL,
  policy_resolution varchar(40) NOT NULL,
  policy_bitrate_kbps integer NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  closed_at timestamptz
);
```

권장 인덱스:

```sql
CREATE INDEX idx_robot_status_location_gist ON robot_status USING gist (last_location);
CREATE INDEX idx_work_zone_polygon_gist ON work_zone USING gist (zone_polygon);
CREATE INDEX idx_work_zone_robot ON work_zone (robot_id);
CREATE INDEX idx_telemetry_robot_time ON telemetry_log (robot_id, recorded_at DESC);
CREATE INDEX idx_telemetry_location_gist ON telemetry_log USING gist (location_point);
CREATE INDEX idx_event_robot_time ON robot_event (robot_id, occurred_at DESC);
CREATE INDEX idx_event_severity_time ON robot_event (severity, occurred_at DESC);
CREATE INDEX idx_command_robot_time ON control_command (robot_id, created_at DESC);
CREATE INDEX idx_command_idempotency ON control_command (robot_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

## 6. JWT 및 RBAC 인증

### 6.1 REST 인증

흐름:

1. `POST /api/auth/login` validates username/password.
2. Server returns access token and user profile.
3. `JwtAuthenticationFilter` validates `Authorization: Bearer <token>`.
4. Controllers use method-level authorization or `ControlPrecheckService`.

Token claim:

- `sub`: account id
- `username`
- `roles`
- `permissions`
- `iat`
- `exp`

비밀번호 저장:

- BCrypt hash
- No plaintext or reversible credentials

### 6.2 RBAC 정책

권장 역할 매핑:

| Role | Permissions |
| --- | --- |
| `read-only` | `robots:read`, `telemetry:read`, `history:read`, `logs:read`, `settings:read`, `video:read` |
| `operator` | read permissions, `control:write`, `work-zone:write` |
| `supervisor` | operator permissions, `control:takeover`, `settings:write` |
| `admin` | all permissions |

추정:
- `settings:write`, `work-zone:write`, `video:read`는 프론트엔드 요구사항과 api-contract open decision을 반영한 확장이다.

### 6.3 STOMP 인증

- WebSocket endpoint: `/ws`
- CONNECT frame에서 JWT를 전달한다.
- `StompAuthChannelInterceptor`가 token을 검증하고 Principal을 설정한다.
- 구독 시 topic의 `robotId`에 대해 최소 `telemetry:read` 또는 해당 topic 권한을 검증한다.

## 7. REST Controller 계획

SRS에 정확한 path는 명시되지 않았으므로 아래 REST path는 `docs/api-contract.md` 기준 추정 계약이다.

### AuthController

- `POST /api/auth/login`
- `GET /api/auth/me`

### RobotController

- `GET /api/robots`
- `GET /api/robots/{robotId}`

### WorkZoneController

- `GET /api/robots/{robotId}/work-zone`
- `PUT /api/robots/{robotId}/work-zone`

규칙:
- GeoJSON Polygon only
- SRID must be 4326
- Polygon ring must be closed
- Minimum four coordinates including closing coordinate
- Persist as PostGIS `geometry(Polygon, 4326)`

### HistoryController

- `GET /api/history?robotId=&from=&to=`

응답:
- robot id
- time range
- track points from `TelemetryLog`
- events from `RobotEvent`

### LogController

- `GET /api/logs?robotId=&from=&to=&severity=&text=`
- `GET /api/logs/snapshots/{snapshotId}`

### ControlController

- `POST /api/robots/{robotId}/control/claim`
- `POST /api/robots/{robotId}/control/release`
- `POST /api/robots/{robotId}/control/takeover`
- `POST /api/robots/{robotId}/control/mode`
- `POST /api/robots/{robotId}/control/manual`
- `POST /api/robots/{robotId}/control/stop`
- `POST /api/robots/{robotId}/control/estop`
- `POST /api/robots/{robotId}/control/reset-after-emergency`
- `POST /api/robots/{robotId}/control/attachment`

모든 명령 endpoint는 다음을 수행해야 한다.

- authenticate user
- authorize permission
- validate selected `robotId`
- validate control lock where required
- validate realtime state
- validate emergency state
- assign command sequence
- persist command intent
- publish MQTT command or reject explicitly
- publish STOMP status/control event

### VideoSignallingController

- `POST /api/video/{robotId}/offer`
- `POST /api/video/{robotId}/stop`
- `POST /api/video/{robotId}/reconnect`

추정:
- Path and payloads are from `docs/api-contract.md`.
- Trickle ICE is an open decision. Initial implementation can use offer/answer without trickle ICE and leave DTO room for `iceCandidates`.

## 8. STOMP WebSocket 구조

Endpoint:

- `/ws`

Broker prefix:

- publish to clients: `/topic`
- optional app inbound prefix: `/app`

Required topics from `docs/api-contract.md`:

- `/topic/robots/{robotId}/telemetry`
- `/topic/robots/{robotId}/status`
- `/topic/robots/{robotId}/events`
- `/topic/robots/{robotId}/control-lock`
- `/topic/robots/{robotId}/control-events`
- `/topic/robots/{robotId}/video-status`

Publish 규칙:

- MQTT telemetry inbound -> persist `TelemetryLog` -> update `RobotStatus` -> publish telemetry/status
- MQTT event inbound -> persist `RobotEvent` -> publish events
- REST control command accepted/rejected -> publish control-lock/control-events
- MQTT command ack -> update `ControlCommand` -> publish control-events/status
- WebRTC session state change -> publish video-status

Payload 규칙:

- All messages include `robotId`
- All messages include ISO-8601 `timestamp`
- Control messages include `commandId` when tied to a command
- Error messages use stable machine-readable `code`

보안:

- Reject unauthenticated CONNECT
- Reject SUBSCRIBE without required read permission
- Never accept safety-critical commands over client STOMP in Phase 1-4 backend; use REST command endpoints first

추정:
- SRS requires WebSocket/STOMP updates but does not define whether clients may send STOMP commands. This plan keeps commands on REST to match existing frontend skeleton and simplify safety auditing.

## 9. MQTT 통합 구조

SRS requires MQTT between backend and Jetson/STM32 side. Exact topic names are not specified, so this topic map is a backend proposal aligned with `docs/api-contract.md`.

### 9.1 Inbound Topic

- `mowers/{robotId}/telemetry`
- `mowers/{robotId}/status`
- `mowers/{robotId}/events`
- `mowers/{robotId}/commands/ack`
- `mowers/{robotId}/video/status`

### 9.2 Outbound Topic

- `mowers/{robotId}/commands/manual`
- `mowers/{robotId}/commands/stop`
- `mowers/{robotId}/commands/estop`
- `mowers/{robotId}/commands/mode`
- `mowers/{robotId}/commands/attachment`
- `mowers/{robotId}/video/signalling`

### 9.3 QoS 정책

SRS mentions QoS separation. Recommended policy:

| Message | QoS | Rule |
| --- | ---: | --- |
| Telemetry | 1 | Preserve observability without duplicate side effects |
| Status/Event | 1 | Persist and forward to STOMP |
| Manual movement | 0 | Latest command wins; do not queue stale manual commands |
| Stop | 1 | Safety command, low latency |
| E-Stop | 1 | Highest priority; publish immediately |
| Mode/Attachment | 1 | Requires ack tracking |
| Video signalling | 0 or 1 | Depends on Jetson implementation; start with 1 for state changes |

### 9.4 MQTT Handler 책임

`MqttInboundHandler`
- Parse payload
- Validate robot id
- Store telemetry/status/event
- Update current robot status
- Update command ack state
- Publish STOMP messages

`MqttCommandPublisher`
- Build command payloads with command id and sequence number
- Publish to robot-specific topic
- Mark command sent/failed
- Never publish normal commands when emergency state is active

`MqttAckService`
- Match ack to `commandId` or `sequenceNo`
- Update command status
- Emit STOMP control event

## 10. 안전 아키텍처

Safety is not a UI concern only. Backend must enforce safety state even when frontend code is bypassed.

### 10.1 제어권(Control Lock)

규칙:

- Only users with `control:write` can claim control.
- Only one active lock per robot.
- Lock includes owner account and owner session.
- Supervisor/admin with `control:takeover` can revoke existing lock.
- Expired lock must block stale owner commands until re-claimed.
- Release command is allowed only by owner or takeover authority.
- Lock state is published to `/topic/robots/{robotId}/control-lock`.

구현:

- `ControlLockService` uses DB transaction and optimistic versioning.
- `SELECT ... FOR UPDATE` or JPA pessimistic lock should be used for lock transitions.
- Lock transitions are recorded as `ControlCommand` or audit events.

### 10.2 명령 사전 점검

`ControlPrecheckService` should evaluate:

- authentication
- RBAC permission
- robot exists and enabled
- current lock ownership
- realtime state
- transport security state
- emergency state
- requested mode compatibility
- command type priority

General commands are rejected when:

- emergency is active
- user lacks permission
- user does not hold control lock
- robot realtime state is `disconnected`
- robot realtime state is `degraded` for movement, mode, and attachment commands
- transport security is insecure for remote control

E-Stop is special:

- allowed for `operator`, `supervisor`, `admin`
- does not require holding the control lock
- outranks all pending normal commands
- must be accepted even if normal control state is invalid, as long as user is authenticated and authorized

### 10.3 E-Stop

Flow:

1. User calls `POST /api/robots/{robotId}/control/estop`.
2. Backend persists emergency command with highest priority.
3. Backend marks robot status mode as `emergency`.
4. Backend cancels/rejects pending normal commands.
5. Backend publishes MQTT E-Stop command.
6. Backend publishes STOMP status/control event.
7. Backend prevents all normal command endpoints until reset.

Reset:

- `reset-after-emergency` requires explicit user action.
- Reset must not resume previous manual/autonomous command.
- After reset, mode should transition to `idle` unless Jetson reports another state.
- Previous `pendingCommand` must remain cleared.

### 10.4 500ms Deadman

Frontend sends stop after 500ms of no input, but backend must also enforce a watchdog.

Backend rules:

- While robot is in manual mode and manual control is active, each manual command updates `lastManualInputAt`.
- `DeadmanWatchdog` runs at a short interval, for example 100ms.
- If `now - lastManualInputAt > 500ms`, backend sends `stop` with speed 0 once and marks manual active false.
- Stop command should not be repeatedly spammed; use command deduplication until new manual input arrives.
- If WebSocket disconnect, browser close, REST timeout, or lock expiry is detected, backend sends stop.

SRS 근거:
- 500ms deadman switch is required.

### 10.5 Stop Command Priority

- `stop` outranks manual movement and attachment commands.
- `estop` outranks `stop`.
- No normal queued command may be sent after `stop` unless a fresh user command passes precheck.
- No command may be auto-resumed after emergency reset.

### 10.6 Edge And STM32 Fail-Safe

Backend safety does not replace edge safety.

Required downstream assumptions from SRS:

- Jetson must stop forwarding stale manual commands.
- STM32 must enter safe stop when command heartbeat is lost.
- Backend should include command timestamp and sequence number so edge can reject stale packets.

## 11. WebRTC Signalling Structure

SRS requires WebRTC video. Backend acts as signalling coordinator, not media relay, unless TURN relay is needed.

### 11.1 REST Signalling

`POST /api/video/{robotId}/offer`

Backend:

- validates `video:read` or `telemetry:read` depending on finalized RBAC
- creates `VideoSession`
- forwards offer to Jetson video service via MQTT or robot-side API
- receives/loads answer
- returns answer, ICE server config, and policy

`POST /api/video/{robotId}/stop`

Backend:

- marks session stopped
- notifies Jetson to stop stream
- publishes `/topic/robots/{robotId}/video-status`

`POST /api/video/{robotId}/reconnect`

Backend:

- closes stale session
- starts new signalling attempt
- publishes reconnecting/failed/connected states

### 11.2 Video Policy

Default policy from frontend Phase 4:

- 15fps
- 480p
- 500kbps

Backend should return policy with start stream response so UI and robot side share the same target.

### 11.3 ICE/TURN

Docker Compose should include optional `coturn` for NAT traversal.

Open decision:

- Use non-trickle offer/answer in initial implementation or add trickle ICE REST endpoints.

Recommended future endpoints if trickle ICE is required:

- `POST /api/video/{robotId}/sessions/{sessionId}/ice-candidates`
- `GET /api/video/{robotId}/sessions/{sessionId}/ice-candidates`

## 12. Docker Compose Plan

Recommended services:

```yaml
services:
  backend:
    build: ./backend
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/mower
      SPRING_DATASOURCE_USERNAME: mower
      SPRING_DATASOURCE_PASSWORD: mower
      JWT_SECRET: change-me
      MQTT_BROKER_URL: tcp://mosquitto:1883
      CORS_ALLOWED_ORIGINS: http://localhost:5173
    depends_on:
      - postgres
      - mosquitto
    ports:
      - "8080:8080"

  postgres:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: mower
      POSTGRES_USER: mower
      POSTGRES_PASSWORD: mower
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  mosquitto:
    image: eclipse-mosquitto:2
    volumes:
      - ./infra/mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro
    ports:
      - "1883:1883"

  coturn:
    image: coturn/coturn:4
    profiles:
      - webrtc
    ports:
      - "3478:3478/udp"
      - "3478:3478/tcp"

volumes:
  postgres-data:
```

Production hardening:

- HTTPS/WSS termination through reverse proxy
- MQTTS with client authentication where possible
- externalized secrets
- restricted CORS origins
- database backups
- actuator health probes

SRS 근거:
- Docker Compose is required.
- HTTPS/WSS/MQTTS and TLS 1.2 are required.

## 13. Implementation Roadmap

### Phase 1: Backend Foundation

Goals:

- Create Spring Boot project under `backend/`
- Add Gradle or Maven build
- Add Docker Compose for backend, PostgreSQL/PostGIS, Mosquitto
- Add Flyway migrations for baseline schema
- Implement global error response format
- Implement JWT login and RBAC foundation
- Seed initial admin/operator/read-only roles
- Implement robot list/detail endpoints with seed data
- Add repository/service/controller test skeleton

Exit criteria:

- Backend starts locally with Docker Compose dependencies
- `POST /api/auth/login` returns JWT
- Protected REST APIs reject missing/invalid JWT
- Database migrations run cleanly
- Basic build/test pipeline passes

### Phase 2: Data, PostGIS, And Realtime Read Model

Goals:

- Implement work zone GET/PUT with GeoJSON Polygon <-> PostGIS conversion
- Implement telemetry ingestion service
- Implement history API from `TelemetryLog`
- Implement log API and snapshot metadata API
- Implement STOMP endpoint and topic publisher
- Implement MQTT inbound telemetry/status/event handling
- Publish telemetry/status/event updates to STOMP topics

Exit criteria:

- Work zone stores valid SRID 4326 Polygon
- History returns PostGIS-compatible track points
- Log query supports date, robot, severity, text filters
- MQTT mock/integration messages update DB and STOMP subscribers
- STOMP subscription requires valid JWT

### Phase 3: Control Safety

Goals:

- Implement control lock state machine
- Implement claim/release/takeover endpoints
- Implement mode/manual/stop/attachment command endpoints
- Implement E-Stop endpoint with highest priority
- Implement reset-after-emergency endpoint
- Implement deadman watchdog with 500ms timeout
- Implement MQTT command publisher and ack tracking
- Implement STOMP control-lock/control-events updates
- Add safety-focused integration tests

Exit criteria:

- Read-only users cannot send write/control commands
- Commands without lock are rejected except authorized E-Stop
- E-Stop blocks all normal commands until explicit reset
- No command auto-resumes after reset
- Manual command silence over 500ms emits stop
- Disconnected/degraded robot state blocks unsafe commands
- Command ack/failure is visible through STOMP

### Phase 4: WebRTC, Operations, And Hardening

Goals:

- Implement WebRTC signalling offer/stop/reconnect endpoints
- Implement video session state and video-status STOMP topic
- Integrate Jetson-side signalling through MQTT or dedicated robot API
- Add optional coturn service and ICE server configuration
- Implement snapshot capture/storage integration
- Add audit logging for auth/control/safety events
- Add observability: actuator health, metrics, structured logs
- Add load and failure-mode tests for STOMP, MQTT, and control safety
- Harden TLS/CORS/secrets for deployment

Exit criteria:

- Video start/stop state transitions are represented in API and STOMP
- Failed signalling attempts timeout and expose stable error codes
- Safety APIs remain deterministic under reconnect/failure scenarios
- Docker Compose can run backend, database, MQTT, and optional TURN services
- API contract and frontend integration tests pass against backend test profile

## 14. Test Strategy

Unit tests:

- RBAC permission checks
- JWT claim parsing
- GeoJSON Polygon validation
- Control precheck decisions
- Deadman watchdog timing
- Command priority ordering

Integration tests:

- REST auth and protected endpoints
- PostGIS persistence and query
- Work zone Polygon round trip
- Control lock concurrency
- E-Stop priority over normal commands
- MQTT inbound/outbound using test broker or mocked adapter
- STOMP authentication and topic authorization

Contract tests:

- Validate REST payloads against `docs/api-contract.md`
- Validate STOMP message shape against frontend types
- Validate WebRTC signalling responses for mock mode

## 15. Open Decisions

The following must be finalized before or during backend implementation:

- Whether `video:read` is separate from `telemetry:read`
- Whether work zone write permission is `settings:write` or `work-zone:write`
- Whether work-zone absence returns `200 null` or `404`
- Exact MQTT topic names and QoS with Jetson firmware team
- Whether WebRTC uses trickle ICE
- Whether client commands should remain REST-only or add STOMP inbound commands later
- Command idempotency header name and retry behavior
- Control lock TTL and heartbeat interval
- Snapshot binary storage location: filesystem, object storage, or database large object
