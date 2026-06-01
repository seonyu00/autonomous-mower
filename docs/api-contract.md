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
      "robotId": "MOWER-01"
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
  "adminId": "admin",
  "password": "plain-password"
}
```

Response `200`:

```json
{
  "accessToken": "jwt-access-token",
  "tokenType": "Bearer",
  "expiresAt": "2026-05-30T09:00:00.000Z",
  "user": {
    "id": "admin",
    "name": "ADMIN USER",
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
    "id": "MOWER-01",
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
  "id": "MOWER-01",
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
  "robotId": "MOWER-01",
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
  "robotId": "MOWER-01",
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
  "robotId": "MOWER-01",
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

### 3.4 이력(History)

#### `GET /api/history?robotId=&from=&to=`

Permission: `history:read`

Response `200`:

```json
[
  {
    "id": "history-001",
    "robotId": "MOWER-01",
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
        "robotId": "MOWER-01",
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

Response `200`:

```json
[
  {
    "id": "log-001",
    "robotId": "MOWER-01",
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

`eventType`: `obstacle-detected | communication-lost | estop | sensor-fault | controller-error | job-event`

#### `GET /api/logs/snapshots/{snapshotId}`

Permission: `logs:read`

Response:

- `200 image/jpeg`
- `404` if missing

### 3.6 제어(Control)

All control endpoints must re-check RBAC and robot/control state server-side. Frontend checks are UI safety only.

Shared response:

```json
{
  "accepted": true,
  "robotId": "MOWER-01",
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
  "robotId": "MOWER-01",
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
  "robotId": "MOWER-01",
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
  "robotId": "MOWER-01",
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
  "robotId": "MOWER-01",
  "attachmentAction": "blade-start",
  "idempotencyKey": "uuid",
  "lockVersion": 7
}
```

`attachmentAction`: `blade-start | blade-stop | raise | lower`

### 3.7 WebRTC 영상 시그널링

The frontend currently uses REST-style signalling. STOMP signalling is not implemented on the frontend.

#### `POST /api/video/{robotId}/offer`

Permission: `telemetry:read` under the current frontend RBAC model.

Request:

```json
{
  "robotId": "MOWER-01",
  "type": "offer",
  "sdp": "v=0...",
  "qualityPolicy": {
    "minFps": 15,
    "width": 640,
    "height": 480,
    "maxBitrateKbps": 500
  }
}
```

Response `200`:

```json
{
  "sessionId": "video-session-001",
  "type": "answer",
  "sdp": "v=0...",
  "iceServers": [
    {
      "urls": ["stun:stun.example.com:3478"]
    }
  ],
  "qualityPolicy": {
    "minFps": 15,
    "width": 640,
    "height": 480,
    "maxBitrateKbps": 500
  }
}
```

#### `POST /api/video/{robotId}/stop`

Permission: `telemetry:read`

Request:

```json
{
  "robotId": "MOWER-01",
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
  "robotId": "MOWER-01",
  "sessionId": "video-session-001"
}
```

Response should clarify one of these policies:

- `{"requiresNewOffer": true}`: frontend creates a new offer.
- `{"sessionId": "video-session-002", "type": "answer", "sdp": "v=0..."}`: backend returns a fresh answer.

Open backend decisions:

- Trickle ICE support.
- ICE candidate REST endpoint or STOMP topic if trickle ICE is used.
- Snapshot capture owner: frontend frame capture, backend video frame capture, or robot-side JPEG capture.
- Codec and hardware encoder policy: H.264/H.265, NVENC, browser fallback.

## 4. STOMP Topic

Endpoint: `wss://{host}/ws`

Authentication: `CONNECT` header `Authorization: Bearer <accessToken>` unless backend chooses secure cookie session.

Frontend currently subscribes per selected robot. Backend should allow unsubscribe/re-subscribe without duplicate stream side effects.

### 4.1 `/topic/robots/{robotId}/telemetry`

Broadcast rate: around 1Hz per SRS. If no telemetry for more than 3 seconds, frontend marks stale/degraded.

Payload:

```json
{
  "robotId": "MOWER-01",
  "latitude": 37.5001,
  "longitude": 127.0001,
  "batteryLevel": 82,
  "mode": "manual",
  "workState": "mowing",
  "speedMps": 0.4,
  "signalStrength": 92,
  "lastReceivedAt": "2026-05-30T01:00:00.000Z",
  "errorState": null
}
```

`mode`: `manual | autonomous | emergency | idle`

`workState`: `idle | mowing | paused | error`

### 4.2 `/topic/robots/{robotId}/status`

Payload:

```json
{
  "robotId": "MOWER-01",
  "connectionState": "online",
  "mqttState": "connected",
  "wssState": "connected",
  "edgeState": "connected",
  "lastSeenAt": "2026-05-30T01:00:00.000Z",
  "stale": false
}
```

`connectionState`: `online | degraded | offline`

### 4.3 `/topic/robots/{robotId}/events`

Payload:

```json
{
  "id": "event-001",
  "robotId": "MOWER-01",
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

### 4.4 `/topic/robots/{robotId}/control-lock`

Payload:

```json
{
  "robotId": "MOWER-01",
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
  "robotId": "MOWER-01",
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
  "robotId": "MOWER-01",
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
