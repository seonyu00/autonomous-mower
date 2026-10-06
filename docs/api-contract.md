# API 및 실시간 계약

이 문서는 `SRS.md`, `docs/frontend-masterplan.md`, `docs/development-log.md`와 현재 프론트엔드 구현을 기준으로 Spring Boot 백엔드가 우선 맞춰야 할 REST/STOMP/WebRTC signalling 계약을 정의한다.

SRS에 endpoint 경로와 signalling 방식은 상세 명시되어 있지 않다. 따라서 `/api/...`, `/topic/...`, WebRTC REST signalling 경로는 프론트엔드 구현과 masterplan에 맞춘 **추정 계약**이다. 백엔드 구현 중 변경이 필요하면 이 문서를 먼저 갱신한 뒤 프론트엔드 타입을 맞춘다.

## 1. 공통 원칙

- 운영 환경의 웹 구간은 HTTPS/WSS만 허용한다.
- 엣지 단말과 서버 간 MQTT는 MQTTS, TLS 1.2 이상을 사용한다.
- REST 인증은 `Authorization: Bearer <accessToken>` 헤더를 기본으로 한다.
- STOMP 인증은 백엔드 정책 확정 전까지 `CONNECT` header의 `Authorization: Bearer <accessToken>`을 우선안으로 둔다.
- 모든 timestamp는 ISO-8601 UTC 문자열을 사용한다. 예: `2026-05-30T01:00:00.000Z`.
- 모든 좌표는 WGS84 longitude/latitude 순서이며 SRID 4326이다.
- 에러 응답은 모든 REST endpoint에서 동일한 형태를 사용한다.

```json
{
  "error": {
    "code": "CONTROL_LOCK_NOT_HELD",
    "message": "Control lock is not held by the requester.",
    "details": {
      "robotId": "<ROBOT_ID>"
    },
    "timestamp": "2026-05-30T01:00:00.000Z",
    "requestId": "req-20260530-0001"
  }
}
```

권장 HTTP status:

- `400`: validation error
- `401`: unauthenticated
- `403`: permission denied
- `404`: resource not found
- `409`: control lock/version conflict
- `423`: robot locked by another operator
- `429`: rate limited
- `500`: server error
- `503`: robot/backend transport unavailable

## 2. 인증과 RBAC

### 역할(Roles)

프론트엔드 현재 role:

- `read-only`
- `operator`
- `supervisor`
- `admin`

### 권한(Permissions)

프론트엔드 현재 permission:

- `robots:read`
- `telemetry:read`
- `history:read`
- `logs:read`
- `settings:read`
- `control:write`
- `control:takeover`

WebRTC 영상은 SRS상 별도 권한명이 없으므로 현재 프론트엔드는 `telemetry:read`를 영상 조회 권한으로 사용한다. 백엔드가 `video:read`를 추가하려면 프론트엔드 RBAC도 함께 변경한다.

## 3. REST API

### 3.1 인증(Auth)

#### `POST /api/auth/login`

Request:

```json
{
  "adminId": "<ADMIN_ID>",
  "password": "<ADMIN_PASSWORD>"
}
```

Response `200`:

```json
{
  "accessToken": "<JWT_TOKEN>",
  "tokenType": "Bearer",
  "expiresAt": "2026-05-30T09:00:00.000Z",
  "user": {
    "id": "<ADMIN_ID>",
    "name": "<ADMIN_NAME>",
    "role": "admin",
    "permissions": ["robots:read", "telemetry:read", "control:write", "control:takeover"]
  }
}
```

### 3.2 로봇(Robots)

#### `GET /api/robots`

Permission: `robots:read`

Response `200`:

```json
[
  {
    "id": "<ROBOT_ID>",
    "modelName": "Orin NX Model-A",
    "connectionState": "online",
    "active": true,
    "lastSeenAt": "2026-05-30T01:00:00.000Z"
  }
]
```

`connectionState`: `online | degraded | offline`

#### `GET /api/robots/{robotId}`

Permission: `robots:read`

Response `200`:

```json
{
  "id": "<ROBOT_ID>",
  "modelName": "Orin NX Model-A",
  "connectionState": "online",
  "active": true,
  "lastSeenAt": "2026-05-30T01:00:00.000Z",
  "control": {
    "lockState": "held",
    "controlOwner": "admin",
    "mode": "manual",
    "emergency": false
  }
}
```

### 3.3 작업 구역(Work Zone)

PostGIS 저장 요구사항: `GEOMETRY(Polygon, 4326)`.

#### `GET /api/robots/{robotId}/work-zone`

권한: `robots:read`

Response `200`:

```json
{
  "zoneId": 12,
  "robotId": "<ROBOT_ID>",
  "version": 4,
  "updatedAt": "2026-05-30T01:00:00.000Z",
  "zone": {
    "type": "Polygon",
    "srid": 4326,
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [127.0001, 37.5001],
          [127.0005, 37.5001],
          [127.0005, 37.5005],
          [127.0001, 37.5005],
          [127.0001, 37.5001]
        ]
      ]
    }
  }
}
```

No active zone response may be `200 null` or `404 WORK_ZONE_NOT_FOUND`. Pick one policy and keep it consistent.

#### `PUT /api/robots/{robotId}/work-zone`

권한: `control:write` 또는 백엔드에서 정의한 작업 구역(Work Zone) 쓰기 권한. 현재 프론트엔드에는 별도 작업 구역 권한이 없으므로 `control:write`를 기본 가정으로 둔다.

Request:

```json
{
  "robotId": "<ROBOT_ID>",
  "expectedVersion": 4,
  "zone": {
    "type": "Polygon",
    "srid": 4326,
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [127.0001, 37.5001],
          [127.0005, 37.5001],
          [127.0005, 37.5005],
          [127.0001, 37.5005],
          [127.0001, 37.5001]
        ]
      ]
    }
  }
}
```

Response `200`:

```json
{
  "saved": true,
  "robotId": "<ROBOT_ID>",
  "zoneId": 12,
  "version": 5,
  "updatedAt": "2026-05-30T01:01:00.000Z"
}
```

검증 요구사항:

- geometry type은 `Polygon`이어야 한다.
- SRID는 `4326`이어야 한다.
- exterior ring은 최소 4개 position을 가져야 한다.
- ring은 닫혀 있어야 한다.
- longitude 범위: `-180..180`
- latitude 범위: `-90..90`
- exterior ring은 자기 교차가 없어야 한다.

#### `POST /api/robots/{robotId}/work-zone/cpp-preview`

`robots:read` 권한으로 저장된 작업 구역의 예정 경로만 생성한다. 요청에는 좌표·실행 파일·명령을 받지 않는다. MQTT·ROS 명령 발행과 결과 영속화는 없다.

```json
{"expectedVersion": 5, "cellSizeM": 1.0}
```

성공 시 공통 `ApiResponse.data`에 다음 형식이 반환된다. `path` 순서는 CPP가 반환한 이동 순서이며 빈 배열도 성공 응답이다.

```json
{
  "robotId": "<ROBOT_ID>", "zoneId": 12, "version": 5, "cellSizeM": 1.0,
  "rows": 22, "columns": 17, "origin": {"lat": 37.0, "lon": 127.0},
  "path": [{"lat": 37.00003144, "lon": 127.00003936}]
}
```

- 저장 GeoJSON `[경도, 위도]`를 CLI의 `{lat, lon}`으로 바꾼다. 내부 ring은 지원하지 않으며 조용히 제거하지 않는다.
- 유한 좌표·유효 Polygon·위도 ±85도·경도 ±180도, 닫는 점 제외 최대 500점, 위경도 폭 각각 1도 이하, 격자 간격 0.2~5m를 검사한다. 지구 반경 6,378,137m와 위경도 범위의 보수적 직사각형으로 계산한 격자는 최대 100,000개다.
- 실행 전후 버전 변경은 409 `WORK_ZONE_CONFLICT`, 잘못된 입력은 400 `CPP_INPUT_INVALID` 또는 `INVALID_REQUEST`다. 구역 미등록은 404다.
- 구역의 남북 높이 또는 평균 위도로 보정한 동서 폭이 격자 간격보다 작으면 CLI 실행 전에 422 `CPP_GRID_TOO_LARGE`로 거부하고 `격자 간격을 줄이세요`를 안내한다. 격자를 만들 수 있지만 반환 경로가 빈 경우는 기존처럼 200이다.
- 기본 실행 제한 5초, stdout 2MiB, 반환 경로 20,000점, 서버 인스턴스당 동시 실행 1개다. 설정 시간의 상한은 30초이며 출력 상한은 설정으로 늘릴 수 없다. stderr는 보관하지 않는다.
- 웹은 네트워크·DB 대기·응답 본문 처리를 포함한 요청을 15초로 제한하고 재시도를 허용한다. 웹 취소가 서버의 DB 처리 중단을 보장하지는 않는다.
- 503 `CPP_UNAVAILABLE`/`CPP_BUSY`, 502 `CPP_FAILED`/`CPP_OUTPUT_INVALID`, 504 `CPP_TIMEOUT`으로 실패를 구분한다.
- **실기체 주행 승인, 경로 연결의 경계 내 포함, 장애물 우회, 커버리지 90%, 기체 폭·회전 반경은 검증하지 않는다.** 다른 사용자의 저장을 실시간으로 웹에 알리는 기능은 없으며, 재조회 및 다음 생성 시 버전을 확인한다.

### 3.4 이력(History)

#### `GET /api/history?robotId=&from=&to=`

Permission: `history:read`

- 화면의 시작일·종료일은 UTC 날짜다. `from`은 시작일 `T00:00:00.000Z`, `to`는 종료일 `T23:59:59.999999999Z`로 보내며 양쪽 경계를 포함한다. 프론트는 누락·유효하지 않은 날짜·역전 범위를 조회 전에 거부한다.
- 응답의 offset 없는 `startedAt`·`endedAt`·이벤트 시각은 기존 UTC 계약으로 해석한다.
- 실제 이력의 거리·커버리지는 아직 집계하지 않으므로 `distanceMeters`, `coveragePercent`는 `null`을 반환한다. 화면은 이를 `미집계`로 표시하며 실제 숫자 `0`과 구분한다. 아래 숫자는 집계된 데이터의 형식 예시다.
- `route.geometry`는 좌표가 두 개 이상이면 `LineString`, 한 개이면 `Point`와 `[경도, 위도]`다. 저장된 텔레메트리가 없으면 빈 목록을 반환한다. 단일 좌표를 복제해 가짜 경로를 만들지 않는다.
- 개발 Mock은 `VITE_ENABLE_MOCK_HISTORY=true`일 때만 사용한다. 화면은 실제 로봇 store를 사용하고 실제·샘플 결과, 조회 중·실패·빈 결과를 구분한다. 새 검색·필터 변경·세션 변경 후 늦은 응답은 현재 결과에 반영하지 않는다.

Response `200`:

```json
[
  {
    "id": "history-001",
    "robotId": "<ROBOT_ID>",
    "startedAt": "2026-05-30T00:00:00.000Z",
    "endedAt": "2026-05-30T00:30:00.000Z",
    "route": {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [127.0001, 37.5001],
          [127.0002, 37.5002]
        ]
      },
      "properties": {
        "srid": 4326
      }
    },
    "events": [
      {
        "id": "event-001",
        "robotId": "<ROBOT_ID>",
        "occurredAt": "2026-05-30T00:10:00.000Z",
        "severity": "warning",
        "type": "obstacle-detected",
        "message": "Obstacle detected.",
        "location": {
          "type": "Feature",
          "geometry": {
            "type": "Point",
            "coordinates": [127.0002, 37.5002]
          },
          "properties": {
            "srid": 4326
          }
        }
      }
    ],
    "distanceMeters": 124.5,
    "coveragePercent": 87
  }
]
```

### 3.5 로그 및 스냅샷

#### `GET /api/logs?robotId=&from=&to=&severity=&text=`

Permission: `logs:read`

`severity`: `all | info | warning | critical`

- `robotId` 생략 시 전체 로봇을 조회한다. 날짜·심각도·검색어 조건은 로봇 선택과 독립적으로 함께 적용한다.
- `from`, `to`는 ISO-8601 UTC 시각이며 경계를 포함한다. `from`만 있으면 해당 시각 이후, `to`만 있으면 해당 시각 이전, 둘 다 없으면 날짜 제한 없이 조회한다.
- `from > to`는 `400 INVALID_REQUEST`로 처리한다. 날짜 조건은 DB 조회에 적용한다.
- `text`는 앞뒤 공백을 제거하고 message, eventType, source에서 대소문자 구분 없이 부분 문자열을 검색한다.
- 웹 날짜 선택은 시작일 `00:00:00.000Z`부터 종료일 `23:59:59.999Z`까지로 변환하며, 비운 날짜는 전송하지 않는다. 한국 시간 날짜로의 변환은 적용하지 않는다.

Response `200`:

```json
[
  {
    "id": "log-001",
    "robotId": "<ROBOT_ID>",
    "severity": "critical",
    "eventType": "estop",
    "message": "Emergency stop command acknowledged.",
    "occurredAt": "2026-05-30T00:10:00.000Z",
    "source": "server",
    "snapshot": {
      "id": "snapshot-001",
      "capturedAt": "2026-05-30T00:10:00.000Z",
      "contentType": "image/jpeg",
      "url": "/api/logs/snapshots/snapshot-001"
    },
    "metadata": {
      "commandId": "cmd-001"
    }
  }
]
```

`eventType`: `obstacle-detected | communication-lost | estop | sensor-fault | controller-error | job-event | manual-snapshot`

#### `POST /api/robots/{robotId}/snapshots`

Permission: `telemetry:read`

Content-Type: `multipart/form-data`

- `file`: 5MB 이하 JPEG
- `captureType`: 현재 `manual`만 허용
- `capturedAt`: ISO 8601 UTC 시각

Response `200`:

```json
{
  "snapshotId": "snapshot-001",
  "robotId": "<ROBOT_ID>",
  "captureType": "manual",
  "capturedAt": "2026-06-15T12:29:58.000Z",
  "contentType": "image/jpeg",
  "fileSize": 184320,
  "url": "/api/logs/snapshots/snapshot-001"
}
```

수동 저장 성공 시 `manual-snapshot`, `dashboard`, `info` 이벤트를 생성하고 저장한 스냅샷을 연결한다.

#### `GET /api/logs/snapshots/{snapshotId}`

Permission: `logs:read`

Response:

- `200 image/jpeg`
- `404` if missing
- 응답은 `Cache-Control: no-store`를 사용한다.

### 3.6 제어(Control)

All control endpoints must re-check RBAC and robot/control state server-side. Frontend checks are UI safety only.

Shared response:

```json
{
  "accepted": true,
  "robotId": "<ROBOT_ID>",
  "commandId": "cmd-20260530-0001",
  "commandType": "manual-command",
  "requestedAt": "2026-05-30T01:00:00.000Z",
  "acceptedAt": "2026-05-30T01:00:00.050Z",
  "lockState": "held",
  "controlOwner": "admin",
  "mode": "manual",
  "emergency": false
}
```

Shared rejection response should use the common error envelope. Important codes:

- `MISSING_CONTROL_PERMISSION`
- `MISSING_TAKEOVER_PERMISSION`
- `CONTROL_LOCK_NOT_HELD`
- `CONTROL_OWNED_BY_OTHER_USER`
- `ROBOT_IN_EMERGENCY`
- `ROBOT_NOT_IN_EMERGENCY`
- `TRANSPORT_NOT_READY`
- `ROBOT_DISCONNECTED`
- `COMMAND_REJECTED_BY_EDGE`

#### `POST /api/control/{robotId}/claim`

Permission: `control:write`

Request:

```json
{
  "idempotencyKey": "uuid",
  "requestedMode": "manual"
}
```

Response: shared control response with `commandType: "claim-control"`.

#### `POST /api/control/{robotId}/release`

Permission: `control:write`

Only current owner can release unless backend allows admin override.

Request:

```json
{
  "idempotencyKey": "uuid",
  "lockVersion": 7
}
```

#### `POST /api/control/{robotId}/takeover`

Permission: `control:takeover`

Request:

```json
{
  "idempotencyKey": "uuid",
  "reason": "supervisor takeover"
}
```

#### `POST /api/control/{robotId}/mode`

Permission: `control:write`, current lock owner.

Request:

```json
{
  "action": "change-mode",
  "robotId": "<ROBOT_ID>",
  "mode": "autonomous",
  "idempotencyKey": "uuid",
  "lockVersion": 7
}
```

`mode`: `idle | manual | autonomous | emergency | home`

Frontend UI sends `autonomous` for AUTO and work start, `idle` for work stop, `manual` for MANUAL, and `home` for HOME.

#### `POST /api/control/{robotId}/manual`

Permission: `control:write`, current lock owner.

Request:

```json
{
  "action": "manual",
  "robotId": "<ROBOT_ID>",
  "direction": "forward",
  "speed": 0.6,
  "idempotencyKey": "uuid",
  "lockVersion": 7,
  "clientSentAt": "2026-05-30T01:00:00.000Z"
}
```

`direction`: `forward | reverse | left | right | rotate-left | rotate-right | stop`

Safety requirements:

- Do not queue stale manual commands.
- Joystick/manual commands should be best-effort/latest-wins.
- Backend-to-edge MQTT policy should map manual control to QoS 0 or equivalent latest-only handling, as SRS requires avoiding accumulated joystick commands.
- End-to-end target for manual control is 200ms.

#### `POST /api/control/{robotId}/stop`

Permission: `control:write`, current lock owner.

Request:

```json
{
  "action": "stop",
  "robotId": "<ROBOT_ID>",
  "direction": "stop",
  "speed": 0,
  "idempotencyKey": "uuid",
  "lockVersion": 7,
  "reason": "deadman-timeout"
}
```

This endpoint must be lightweight enough for deadman/page lifecycle stop attempts. Backend should also implement server/edge fail-safe because browser `beforeunload` completion is not guaranteed.

#### `POST /api/control/{robotId}/estop`

Permission: `control:write`.

E-Stop does not require current control ownership. It has highest priority over all normal commands.

Request:

```json
{
  "idempotencyKey": "uuid",
  "reason": "operator emergency stop"
}
```

Safety requirements:

- E-Stop must interrupt drive and mower attachment outputs.
- E-Stop command should map to QoS 1 or stronger delivery semantics toward edge/MQTT.
- Normal commands must be rejected while emergency is active.

#### `POST /api/control/{robotId}/reset-after-emergency`

Permission: `control:write`.

Request:

```json
{
  "idempotencyKey": "uuid",
  "reason": "operator verified safe state"
}
```

Safety requirements:

- Robot must currently be in emergency state.
- Reset returns robot to `idle`.
- Previous drive or mower commands must not auto-resume.
- Explicit new operator command is required after reset.

#### `POST /api/control/{robotId}/attachment`

Permission: `control:write`, current lock owner.

Request:

```json
{
  "action": "mower-attachment",
  "robotId": "<ROBOT_ID>",
  "attachmentAction": "blade-start",
  "idempotencyKey": "uuid",
  "lockVersion": 7
}
```

`attachmentAction`: `blade-start | blade-stop | raise | lower`

### 3.7 WebRTC 영상 시그널링

백엔드는 MediaMTX와 SDP를 중계하지 않는다. 인증된 사용자에게 로봇별 WHEP URL을 발급하고 논리적인 세션 상태만 관리한다. 브라우저는 발급받은 WHEP URL에 직접 SDP offer를 전송한다.

브라우저의 시그널링 요청은 10초, WHEP 연결 준비 전체(SDP 생성·ICE 수집·HTTP 응답 및 본문·실제 PeerConnection 연결)는 별도로 10초를 제한한다. 연결 중 취소할 수 있으며, 취소·실패·재연결 시 이전 시도의 응답과 이벤트는 새 연결 상태에 반영하지 않는다. 로컬 트랙·PeerConnection·영상 요소를 먼저 정리하고 WHEP DELETE와 백엔드 stop은 각각 10초 제한으로 별도 시도한다. 응답이 없거나 세션 ID/Location을 받지 못한 경우 원격 삭제 완료는 보장하지 않는다. 늦게 확인한 이전 세션은 삭제를 시도하되 새 로그인 세션의 권한으로 이전 백엔드 세션을 정리하지 않는다.

SDP 교환이나 ontrack만으로 연결 성공·프레임 수신을 확정하지 않는다. 연결 표시는 실제 PeerConnection 상태를 따르고, 프레임 표시는 영상 요소의 프레임 콜백을 기준으로 별도 관리한다. 프레임 콜백을 지원하지 않는 브라우저는 재생 시간 진행과 readyState를 사용한다. 1초 주기로 검사해 3초 이상 새 프레임이 없으면 수신 중단을 표시하고 새 프레임에서 복구한다. 이 값은 영상 표시 관측이며 네트워크 지연·FPS 측정값은 아니다. 샘플 세션에는 실제 프레임이 있다고 표시하지 않는다.

#### `POST /api/video/{robotId}/offer`

Permission: `telemetry:read` under the current frontend RBAC model.

Request:

```json
{
  "robotId": "<ROBOT_ID>",
  "width": 640,
  "height": 480,
  "fps": 15,
  "maxBitrateKbps": 500
}
```

Response `200`:

```json
{
  "sessionId": "video-session-001",
  "robotId": "<ROBOT_ID>",
  "whepUrl": "http://100.92.7.56:8889/mowers/<ROBOT_ID>/whep",
  "state": "connecting",
  "createdAt": "2026-06-13T08:00:00Z"
}
```

#### `POST /api/video/{robotId}/stop`

Permission: `telemetry:read`

Request:

```json
{
  "robotId": "<ROBOT_ID>",
  "sessionId": "video-session-001"
}
```

Response:

- `204 No Content`, or
- `200 {"stopped": true, "sessionId": "video-session-001"}`

#### `POST /api/video/{robotId}/reconnect`

Permission: `telemetry:read`

Request:

```json
{
  "robotId": "<ROBOT_ID>",
  "sessionId": "video-session-001"
}
```

Response:

- 기존 세션을 중지하고 새 `sessionId`와 동일한 로봇의 `whepUrl`을 반환한다.
- 프론트는 기존 로컬 연결을 즉시 닫고 WHEP resource의 `DELETE`를 별도로 시도하며, 삭제 응답을 기다리지 않고 새 WHEP 연결을 진행한다.

Open backend decisions:

- Snapshot capture owner: frontend frame capture, backend video frame capture, or robot-side JPEG capture.
- 인터넷 공개 시 TLS, TURN과 MediaMTX 인증을 적용할 방식.

## 4. STOMP Topic

Endpoint: `wss://{host}/ws`

Authentication: `CONNECT` header `Authorization: Bearer <accessToken>` unless backend chooses secure cookie session.

Frontend currently subscribes per selected robot. Backend should allow unsubscribe/re-subscribe without duplicate stream side effects.

클라이언트 입력 권한은 `StompJwtAuthenticationInterceptor`에서 브로커 진입 전에 검사한다. `CONNECT`의 기존 JWT 인증을 유지하며, 인증된 사용자에게 `telemetry:read` 권한이 있을 때만 아래 4.1~4.6의 로봇별 토픽 6개를 `SUBSCRIBE`하도록 허용한다. 로봇 ID는 비어 있지 않은 단일 경로 구간이어야 하며 와일드카드·경로 패턴 구독과 그 밖의 목적지는 거부한다. 제어 상태 토픽을 조회하는 데 `control:write`는 요구하지 않는다.

현재 클라이언트 발행 계약은 없으므로 `/topic/**`, `/app/**`를 포함한 모든 클라이언트 `SEND`를 거부한다. 서버의 토픽 발행, 구독 해제, 연결 종료와 heartbeat는 유지한다. 이 정책은 HTTP 로그인 방식이나 MQTT 브로커 인증을 변경하지 않는다.

### 4.1 `/topic/robots/{robotId}/telemetry`

SRS 기준 약 1Hz로 전송한다. 서버 마지막 수신 후 3초 이상이면 `delayed`로 판정한다. 서버는 250ms 주기로 상태 전이를 검사하고, 브라우저도 추가 메시지 없이 경과 시간을 갱신한다.

Payload:

```json
{
  "robotId": "<ROBOT_ID>",
  "latitude": 37.5001,
  "longitude": 127.0001,
  "batteryLevel": 82,
  "mode": "manual",
  "workState": "mowing",
  "speedMps": 0.4,
  "signalStrength": 92,
  "lastReceivedAt": "2026-05-30T01:00:00.000Z",
  "edgeSampledAt": "2026-05-30T00:59:59.900Z",
  "serverTimestamp": "2026-05-30T01:00:00.010Z",
  "errorState": null
}
```

`mode`: `manual | autonomous | emergency | idle`

`workState`: `idle | mowing | paused | error`

`lastReceivedAt`은 서버의 MQTT 텔레메트리 처리 진입 시각이며 DB 기록에도 같은 값을 사용한다. `edgeSampledAt`은 MQTT `receivedAt`을 보존한 Edge 샘플 생성 시각이다. `serverTimestamp`는 서버 응답 생성 시각이며 브라우저는 서버 경과 시간과 브라우저 경과 시간을 합산한다. Edge 시각은 지연 판정에 사용하지 않는다.

### 4.2 `/topic/robots/{robotId}/status`

Payload:

```json
{
  "robotId": "<ROBOT_ID>",
  "connectionState": "online",
  "mqttState": "connected",
  "wssState": "connected",
  "edgeState": "connected",
  "lastSeenAt": "2026-05-30T01:00:00.000Z",
  "stale": false,
  "telemetryReception": {
    "state": "normal",
    "lastReceivedAt": "2026-05-30T01:00:00.000Z",
    "edgeSampledAt": "2026-05-30T00:59:59.900Z",
    "checkedAt": "2026-05-30T01:00:00.010Z"
  }
}
```

`connectionState`: `online | degraded | offline`

`telemetryReception`은 로봇 목록·상세 조회 응답에도 포함한다. `state`는 `never-seen | normal | delayed`이며 서버 프로세스 시작 후 수신 이력이 없으면 `never-seen`, 두 수신 시각은 null이다. `checkedAt`은 서버 판정 시각이다. 수신 상태는 현재 서버 메모리에 보관하며 재시작 후 첫 수신으로 다시 초기화한다.

Edge status의 `lastSeenAt`과 텔레메트리 마지막 서버 수신은 별개다. status heartbeat는 텔레메트리 수신 시각을 갱신하지 않는다. 지연·복구 전이만 각각 `telemetry-delayed`·`telemetry-recovered` 이벤트로 한 번 기록하고 발행한다. 같은 Edge 상태는 시각이 달라도 DB `status-update`를 중복 기록하지 않는다.

### 4.3 `/topic/robots/{robotId}/events`

Payload:

```json
{
  "id": "event-001",
  "robotId": "<ROBOT_ID>",
  "severity": "warning",
  "eventType": "obstacle-detected",
  "message": "Obstacle detected.",
  "occurredAt": "2026-05-30T01:00:00.000Z",
  "source": "edge",
  "location": {
    "type": "Feature",
    "geometry": {
      "type": "Point",
      "coordinates": [127.0002, 37.5002]
    },
    "properties": {
      "srid": 4326
    }
  },
  "snapshot": {
    "id": "snapshot-001",
    "capturedAt": "2026-05-30T01:00:00.000Z",
    "contentType": "image/jpeg",
    "url": "/api/logs/snapshots/snapshot-001"
  }
}
```

최근 경고 및 이벤트 패널은 기존 `GET /api/logs`의 선택 로봇 초기 목록에 이 topic의 이벤트를 합친다. 같은 `id`는 한 번만 표시하며 `occurredAt` 내림차순 최신 3건을 유지한다. `eventType`과 `source`는 서버가 제공하는 문자열이므로 `telemetry-delayed`·`telemetry-recovered`와 `telemetry-monitor`도 허용한다.

파서는 필수 필드·심각도·시각과 topic/payload 로봇 ID 일치를 확인한다. 로봇·세션 변경 후 도착한 이전 요청은 성공·실패 모두 현재 패널에 반영하지 않는다. 샘플 로그 모드에는 실제 STOMP 이벤트를 섞지 않는다. 기존 로그 API의 offset 없는 UTC LocalDateTime은 최근 목록에서만 UTC로 해석해 STOMP 시각과 함께 정렬한다. API 경로·조회 조건·응답 구조는 변경하지 않는다.

### 4.4 `/topic/robots/{robotId}/control-lock`

Payload:

```json
{
  "robotId": "<ROBOT_ID>",
  "lockState": "held",
  "controlOwner": "admin",
  "controlOwnerName": "ADMIN USER",
  "mode": "manual",
  "emergency": false,
  "lockVersion": 7,
  "expiresAt": "2026-05-30T01:05:00.000Z",
  "reason": "claim-control",
  "updatedAt": "2026-05-30T01:00:00.000Z"
}
```

`lockState`: `none | requesting | held | held-by-other | expired | revoked`

Server should publish this topic after claim, release, takeover, expiry, revocation, E-Stop, and reset-after-emergency.

### 4.5 `/topic/robots/{robotId}/control-events`

This topic is not currently in the frontend skeleton but is recommended for command ack/error separation.

Payload:

```json
{
  "robotId": "<ROBOT_ID>",
  "commandId": "cmd-20260530-0001",
  "commandType": "manual-command",
  "status": "accepted",
  "reason": null,
  "requestedBy": "admin",
  "serverTimestamp": "2026-05-30T01:00:00.050Z",
  "edgeAckAt": "2026-05-30T01:00:00.120Z"
}
```

`status`: `accepted | rejected | sent-to-edge | edge-ack | edge-timeout | failed`

### 4.6 `/topic/robots/{robotId}/video-status`

Payload:

```json
{
  "robotId": "<ROBOT_ID>",
  "sessionId": "video-session-001",
  "state": "connected",
  "fps": 15,
  "width": 640,
  "height": 480,
  "bitrateKbps": 480,
  "codec": "H264",
  "error": null,
  "updatedAt": "2026-05-30T01:00:00.000Z"
}
```

`state`: `idle | connecting | connected | reconnecting | disconnected | failed`

## 5. 백엔드 안전 책임

- 프론트엔드 RBAC와 상태 사전 점검은 UX 보조 수단일 뿐이다. 백엔드는 모든 제어 권한과 상태 전이를 반드시 강제해야 한다.
- 긴급 정지(E-Stop)는 일반 제어, 작업, 예초 장치, 모드 명령보다 항상 우선한다.
- 긴급 상태 초기화는 이전 명령을 재개하면 안 된다.
- 수동 조이스틱 명령은 queue에 쌓지 않는다.
- 정지 명령은 저지연 경로로 수락하고 server/edge fail-safe로 보강한다.
- 브라우저 lifecycle 때문에 정지 전달이 실패할 수 있으므로, server/edge는 세션 손실, lock 만료, 텔레메트리(Telemetry) 공백, 제어 heartbeat 손실 시에도 정지해야 한다.
- SRS의 Jetson/STM32 fail-safe는 여전히 필수다. 상위 제어 통신이 정의된 임계값을 넘겨 중단되면 STM32는 PWM을 정지해야 한다.

## 6. 미결정 사항

- Whether to add explicit `video:read` permission.
- Whether work-zone write should use `control:write` or a separate `work-zone:write`.
- Whether no work zone is represented as `200 null` or `404`.
- Whether WebRTC trickle ICE is required.
- Whether STOMP command ack uses a new `/control-events` topic or is folded into `/control-lock` and `/events`.
- Exact MQTT topic/QoS mapping between Spring Boot and Jetson.
- Exact command idempotency and sequence policy.

## 7. 계정·권한 설정 — 2026-10-05

사용자는 계정·권한 서버 설정의 설계를 먼저 선택한 뒤 구현을 요청했고, 신규 ID 최대 20자·새 비밀번호 최소 10자를 확정했다. 아래는 현재 구현된 계약이다. 기존 네 역할과 제어·MQTT 메시지 계약을 유지하며 인증에는 계정 상태와 세션 폐기를 적용한다. 작업 순서와 완료 기준은 [개발 로드맵](learning/12-development-roadmap.md)의 계정 설정 절에서 관리한다. 수행한 검증과 하드웨어 검증의 경계는 [개발 로그](development-log.md)를 따른다.

### 7.1 구현과 기존 계정 호환성

- `SettingsPage.tsx`에 내 계정·계정 관리·감사 조회·연결 상태를 구현했다. `GET /api/auth/me`를 재사용하고 `mustChangePassword`를 추가했다.
- V9는 `Admin`에 활성 여부·변경 버전·세션 버전·비밀번호 변경 필요 여부·수정 시각을 추가한다. 기존 ID·해시·역할·생성 시각은 보존하며 기존 계정은 활성·세션 버전 0·강제 변경 없음으로 시작한다. DB의 ID 50자 한도는 기존 계정을 위해 유지한다.
- 역할은 `read-only`, `operator`, `supervisor`, `admin` 네 가지다. 역할별 개별 권한 편집은 범위 밖이다.
- 모든 역할에 `settings:read`를 부여하도록 프론트를 서버와 맞췄다. 별도의 `accounts:read`, `accounts:write`는 admin만 가진다.
- JWT 인증, STOMP 연결·구독·송신은 최신 DB 상태를 확인한다. 변경 후 열린 WebSocket 종료와 기존 JWT 거부를 실제 PC 서버에서 확인했다. 다중 서버 운영 및 하드웨어 검증 완료를 의미하지 않는다.

### 7.2 화면과 관리 범위

설정 화면은 내 계정, 계정 관리, 계정 변경 기록, 연결 상태로 구성한다. 내 계정에는 ID·역할·권한·로그아웃·본인 비밀번호 변경을 표시한다. 연결 상태는 계정 API 조회 결과, STOMP 상태, 지도 설정 여부를 보여준다. 영상 연결은 기존 영상 패널에서 확인한다. 토큰, Client Secret, MQTT 비밀번호를 노출하지 않는다. 연결 주소와 TLS·데드맨·제어 정책을 일반 운용자 화면에서 변경하지 않는다.

계정 관리에는 ID 검색과 페이지 목록, 계정 생성, 역할 변경, 활성·비활성 전환, 비밀번호 재설정을 제공한다. 권한·상태 저장 전 대상 ID, 변경 전후 값, 기존 세션 종료 영향을 표시하고 확인을 받는다. 목록과 변경 폼은 같은 페이지에 있으며 실패 시 입력을 유지한다. 모바일에서는 각 행의 ID·역할·상태·동작 순서와 표 내부 스크롤을 유지한다. 성공 문구는 서버 응답 후에만 표시한다. 샘플 인증에서는 관리 API와 비밀번호 변경을 호출하지 않는다.

모든 인증 사용자는 자기 정보만 읽고 본인 비밀번호를 변경할 수 있다. 다른 계정 목록·감사 조회와 변경은 admin만 허용한다. `settings:read`로 계정 관리 권한을 얻지 못한다. supervisor의 제어권 강제 회수 권한도 별개다. 서버는 매 요청의 계정 상태와 권한을 검사하며 프론트의 버튼 숨김에만 의존하지 않는다. 기존 역할의 장비 제어 권한은 유지한다.

계정 물리 삭제, 사용자 정의 역할, 사용자별 임의 권한, 이메일 초대·복구, 조직별 장비 접근 정책은 별도 범위다. 비활성화를 사용해 과거 제어·감사 기록의 행위자 참조를 보존한다.

### 7.3 REST 계약

기존 `{success, data, error, timestamp}` 응답과 Bearer 인증 형식을 유지한다. 모든 시간은 UTC ISO-8601이며 비밀번호 해시와 토큰 원문을 계정 조회 응답에 포함하지 않는다.

| 메서드·경로 | 권한 | 요청·응답 요약 |
|---|---|---|
| `GET /api/auth/me` | 인증 사용자 본인 | ID, 역할, 실제 권한, 비밀번호 변경 필요 여부 |
| `GET /api/accounts?search=&page=0&size=20` | `accounts:read` | ID 검색, 기본 20·최대 100건, 안정적인 ID 정렬, 총 건수 포함 |
| `GET /api/accounts/{adminId}` | `accounts:read` | 충돌 이후 대상의 최신 정보·version을 정확한 ID로 재조회 |
| `POST /api/accounts` | `accounts:write` | `{adminId, role, temporaryPassword}` → 생성 계정의 ID·역할·활성 상태·version·생성 시각 |
| `PATCH /api/accounts/{adminId}` | `accounts:write` | `{role, enabled, expectedVersion}` → 변경된 계정 정보 |
| `POST /api/accounts/{adminId}/password-reset` | `accounts:write` 및 현재 관리자 비밀번호 재확인 | `{temporaryPassword, currentPassword, expectedVersion}` → 변경 계정의 새 version·mustChangePassword=true |
| `PUT /api/auth/password` | 인증 사용자 본인 | `{currentPassword, newPassword}` → 기존 세션 폐기 후 재로그인 |
| `GET /api/accounts/audit?page=0&size=20` | `accounts:read` | 행위자·대상 ID, 작업, 역할·상태 변경 전후, UTC 시각 |

신규 ID는 영문·숫자·점·밑줄·하이픈으로 1~20자이며 공백을 허용하지 않는다. 생성 후 ID는 바꿀 수 없다. 기존 20자 초과 ID는 로그인·검색·관리할 수 있도록 DB 50자 한도와 조회 경로를 유지한다. 역할은 기존 네 값만 허용하고 임의 권한 배열은 받지 않는다.

새 비밀번호와 임시 비밀번호는 Unicode 문자 수 기준 최소 10자, UTF-8 최대 72바이트다. 공백만으로 구성된 값은 거부하고 숫자·대소문자·특수문자 혼합을 강제하지 않는다. 기존 비밀번호를 자동 변경하지 않는다. BCrypt 입력 제한을 초과한 값을 묵시적으로 자르지 않으며 원문은 요청 처리 중에만 사용한다. 초기·재설정 비밀번호는 응답·로그·감사에 재출력하지 않는다.

목록은 `{items,page,size,totalElements,totalPages}`이고 page는 0 이상, size는 1~100이다. ID 검색은 최대 50자이며 대소문자를 구분하지 않는 부분 검색이다. 계정 응답에는 `{adminId,role,enabled,version,mustChangePassword,createdAt,updatedAt}`만 포함하고 세션 버전·해시는 노출하지 않는다. 본인 비밀번호 변경 성공은 `{requiresLogin:true}`를 반환한다.

### 7.4 동시 변경과 세션 처리

- V9는 계정 상태, `account_management_guard` 잠금 행, `account_audit`를 추가한다. 기존 계정의 강제 비밀번호 변경 전환은 적용하지 않는다.
- 계정 변경은 `expectedVersion`을 비교해 충돌을 409로 반환한다. 프론트는 편집 내용을 보존하고 최신 정보 재조회를 안내한다.
- 모든 계정 쓰기는 트랜잭션 시작 시 `account_management_guard.id=1`을 `FOR UPDATE`로 잠근 뒤 행위자 상태를 새로 읽는다. 마지막 활성 admin의 비활성화·권한 하향을 거부한다. 독립 서비스 인스턴스의 실제 PostgreSQL 동시 변경 테스트에서 활성 admin이 한 명 남는 것을 확인했다.
- 자기 계정 비활성화·역할 하향을 거부한다. 대상이 유효한 제어권을 보유하면 권한·상태 변경·비밀번호 재설정과 본인 비밀번호 변경을 409로 거부한다. 제어권 반납을 먼저 수행하며 계정 설정은 예초기 명령이나 강제 정지를 자동 발행하지 않는다. 단일 서버에서 계정 쓰기와 제어권 취득·인수를 같은 `AccountSessionCoordinator`로 조정하고 취득 직전 현재 계정 권한을 재검사한다. 현재 제어권은 메모리 저장소이므로 여러 서버의 제어권 동기화는 별도 구현·검증이 필요하다.
- JWT에 `sessionVersion`을 담고 REST 인증 시 DB의 활성 여부·현재 세션 버전을 검사한다. 역할·활성 상태 또는 비밀번호 변경·재설정 시 세션 버전을 증가시킨다. 이전 토큰은 401로 거부한다. 변경 없는 PATCH는 버전·감사·세션을 유지한다. **업데이트 배포 시 sessionVersion이 없는 기존 JWT는 일괄 재로그인이 필요하다.**
- STOMP CONNECT·SUBSCRIBE·서버 송신에도 같은 검증을 적용한다. 계정·감사 커밋 후 대상의 열린 연결을 1008로 종료하며 프론트는 자동 재연결을 중단한다. 다른 서버에서의 변경과 토큰 만료도 1초 주기 검사와 송신 검사로 감지한다. 이미 연결된 세션을 남겨두고 새 로그인만 차단하는 구현은 완료로 인정하지 않는다.
- 초기·재설정 비밀번호 로그인은 일반 관제 API와 STOMP를 이용할 수 없는 제한된 변경 절차로 연결한다. 비밀번호 변경 후 새로 로그인해야 한다.
- 프론트는 401과 세션 폐기 시 인증·장비·조회 캐시를 기존 `clearSession()` 흐름으로 비우고 로그인 화면으로 이동한다. 기존 세션에서 늦게 도착한 응답으로 데이터를 복원하지 않는다.

### 7.5 오류·감사 정책

401은 미인증·종료된 세션, 403은 권한 없음 또는 임시 비밀번호의 관제 접근, 404 `ACCOUNT_NOT_FOUND`는 없는 계정이다. 409는 `ACCOUNT_DUPLICATE`, `ACCOUNT_VERSION_CONFLICT`, `ACCOUNT_LAST_ADMIN`, `ACCOUNT_SELF_CHANGE`, `ACCOUNT_CONTROL_HELD`로 구분한다. 400은 잘못된 입력·역할, `PASSWORD_POLICY`, 현재 비밀번호 불일치 `PASSWORD_CURRENT_INVALID`이며 마지막 오류는 현재 로그인과 폼 입력을 유지한다.

계정 변경 감사는 로봇 이벤트와 별도 테이블에 기록한다. 변경 성공과 감사 기록은 같은 트랜잭션으로 저장하고 행위자·대상·작업·역할 및 상태 변경 전후를 포함한다. 비밀번호·해시·JWT는 남기지 않는다. 감사 저장 실패 시 계정 변경을 롤백하고 열린 세션도 종료하지 않는다. 조회는 admin만 허용하며 UTC 시각 내림차순·동률 ID 순으로 페이지화한다. 최초 관리자는 기존 수동 등록 절차를 유지하며 공개 가입·자동 기본 관리자 생성을 추가하지 않았다. 감사 기록은 자동 삭제하지 않고 보존 기간 확정·삭제 기능은 운영 후속 범위로 남긴다.

설계 참고: [OWASP 권한 검사 지침](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [세션 관리 지침](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). 이 자료는 서버 권한 검사·세션 종료 원칙의 근거이며 프로젝트의 구현 완료 증거가 아니다.
