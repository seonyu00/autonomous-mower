# MQTT Topic 계약

상태 메시지의 선택적 `manualLockReason`은 `edgeState=manual-serial-locked`의 원인 진단 문자열이다. 기존 토픽·상태값과 필수 필드는 유지한다. 원인 부재는 정상·안전을 뜻하지 않으며 구버전은 해당 필드를 보내지 않을 수 있다. 지원 값과 웹 처리는 [API 및 실시간 계약](api-contract.md)의 수동 잠금 원인 절을 따른다.

이 문서는 Spring Boot 백엔드와 Jetson Edge Client 사이의 MQTT 통합 계약이다.

현재 `edge/jetson-client/`와 `tools/edge-mock-client/`가 이 계약을 기준으로 구현되어 있다. 백엔드, Jetson Edge Client, Edge Mock의 topic, QoS, payload를 변경할 때는 이 문서와 각 구현을 함께 갱신해야 한다.

## Version

- Contract version: `mqtt-command-v1`
- Encoding: UTF-8 JSON
- Broker: MQTT 3.1.1 compatible
- Retained messages: false for all topics in this phase
- Timestamp format: ISO-8601 UTC string, for example `2026-05-31T01:23:45.678Z`
- `robotId` path and payload must match exactly. A receiver must reject mismatched messages.

## Topic Map

### Backend To Edge

| Topic | Direction | QoS | Payload |
|---|---:|---:|---|
| `mowers/{robotId}/commands/manual` | Backend -> Jetson | 0 | Command payload with `commandType="manual-command"` |
| `mowers/{robotId}/commands/stop` | Backend -> Jetson | 1 | Command payload with `commandType="stop"` |
| `mowers/{robotId}/commands/estop` | Backend -> Jetson | 1 | Command payload with `commandType="emergency-stop"` |
| `mowers/{robotId}/commands/mode` | Backend -> Jetson | 1 | Command payload with `commandType="change-mode"` |
| `mowers/{robotId}/commands/attachment` | Backend -> Jetson | 1 | Command payload with `commandType="mower-attachment"` |

### Edge To Backend

| Topic | Direction | QoS | Payload |
|---|---:|---:|---|
| `mowers/{robotId}/telemetry` | Jetson -> Backend | 1 | Telemetry payload |
| `mowers/{robotId}/status` | Jetson -> Backend | 1 | Status payload |
| `mowers/{robotId}/events` | Jetson -> Backend | 1 | Event payload |
| `mowers/{robotId}/commands/ack` | Jetson -> Backend | 1 | Command ack payload |

## Command Payload

### 수동 조작 확인값 (개발 중)

서버는 기존 `commands/mode`에 QoS 0의 `manual-challenge`를 보낸다. `parameters`에 재개 목적 또는 이동 목적과 재개·누름 식별자, 방향 및 속도를 포함한다. Jetson은 기존 `commands/ack`에 QoS 1로 `{robotId,commandId,commandType:"manual-challenge",challenge}`를 발행한다. 서버는 대기 중인 동일 로봇과 요청 ID만 연결하고 확인값을 명령 이력이나 로그에 저장하지 않는다. retain은 사용하지 않는다.

재개·이동 명령의 `parameters.challenge`이 존재하면 Jetson은 일회용 확인값과 발급 시 결합한 로봇·조작자·제어권 버전·입력 범위 및 발급 후 단조 시간으로 검사한다. 재개는 2초 미만, 이동은 350ms 미만이다. 정지·비상 정지·MQTT 단절 및 리모컨 활성 상태 관측 시 확인값을 무효화한다. 재개 및 이동에 확인값이 없으면 아래의 기존 시각 검사로 처리한다. 실장비 적용과 종단 지연은 미검증이다.

All backend-to-edge command messages use the same envelope:

```json
{
  "commandId": "cmd-uuid-or-server-id",
  "robotId": "<ROBOT_ID>",
  "commandType": "manual-command",
  "idempotencyKey": "manual-uuid-from-client",
  "lockVersion": 7,
  "clientSentAt": "2026-05-31T01:23:45.678Z",
  "requestedBy": "operator",
  "requestedAt": "2026-05-31T01:23:45.700Z",
  "priority": "normal",
  "parameters": {}
}
```

Field policy:

| Field | Required | Policy |
|---|---:|---|
| `commandId` | yes | Backend-generated unique command identifier. Jetson must echo it in ack. |
| `robotId` | yes | Must match `{robotId}` in the topic. |
| `commandType` | yes | One of `manual-command`, `stop`, `emergency-stop`, `change-mode`, `mower-attachment`. |
| `idempotencyKey` | manual/stop/mode/attachment/estop yes, deadman stop may be null | Originates from frontend REST command where available. Jetson must use `(robotId, idempotencyKey)` to ignore duplicate QoS 1 deliveries when the value is present. |
| `lockVersion` | manual/stop/mode/attachment yes, estop/deadman may be null | Control lock version observed by backend when command was accepted. Jetson must reject stale normal commands if it tracks a newer lock version. E-Stop ignores lock version. |
| `clientSentAt` | manual yes, others may be null | 확인값이 없는 기존 수동 명령의 시각 유효성을 검사한다. 확인값을 사용하는 시리얼 수동 명령은 Jetson의 단조 시간으로 확인값의 발급 후 경과 시간을 검사한다. |
| `requestedBy` | yes | Backend account id or `system` for server-generated deadman stop. |
| `requestedAt` | yes | Backend acceptance/publish time. |
| `priority` | yes | `normal`, `stop`, or `emergency`. |
| `parameters` | yes | Command-specific object. Empty object is allowed only when specified below. |

### Manual Command

Topic: `mowers/{robotId}/commands/manual`

QoS: 0

```json
{
  "commandId": "cmd-manual-001",
  "robotId": "<ROBOT_ID>",
  "commandType": "manual-command",
  "idempotencyKey": "manual-uuid",
  "lockVersion": 7,
  "clientSentAt": "2026-05-31T01:23:45.678Z",
  "requestedBy": "operator",
  "requestedAt": "2026-05-31T01:23:45.700Z",
  "priority": "normal",
  "parameters": {
    "direction": "forward",
    "speed": 0.6
  }
}
```

Rules:

- `direction`: `forward`, `backward`, `left`, `right`, or `stop`.
- `speed`: number from `0.0` to `1.0`.
- Manual command processing is latest-wins. Jetson must not queue stale joystick messages.
- Jetson must stop drive output if no fresh manual command is received within 500 ms while manual movement is active.

### Stop Command

Topic: `mowers/{robotId}/commands/stop`

QoS: 1

```json
{
  "commandId": "cmd-stop-001",
  "robotId": "<ROBOT_ID>",
  "commandType": "stop",
  "idempotencyKey": "stop-uuid",
  "lockVersion": 7,
  "clientSentAt": null,
  "requestedBy": "operator",
  "requestedAt": "2026-05-31T01:23:46.000Z",
  "priority": "stop",
  "parameters": {
    "reason": "operator-stop",
    "speed": 0
  }
}
```

Rules:

- `speed` must be `0`.
- Jetson must stop drive output immediately.
- Stop does not clear emergency state if emergency is already active.
- Backend deadman stop uses this command with `requestedBy="system"`, `reason="deadman-timeout"`, and nullable `idempotencyKey`/`lockVersion`.

### Emergency Stop Command

Topic: `mowers/{robotId}/commands/estop`

QoS: 1

```json
{
  "commandId": "cmd-estop-001",
  "robotId": "<ROBOT_ID>",
  "commandType": "emergency-stop",
  "idempotencyKey": "estop-uuid",
  "lockVersion": null,
  "clientSentAt": null,
  "requestedBy": "operator",
  "requestedAt": "2026-05-31T01:23:47.000Z",
  "priority": "emergency",
  "parameters": {
    "reason": "operator emergency stop"
  }
}
```

Rules:

- E-Stop은 모든 일반 명령, mode 명령, attachment 명령보다 우선한다.
- Jetson은 주행 출력과 작업 장치 출력을 즉시 정지해야 한다.
- 현재 Jetson ROS 2 edge client는 하드웨어 브릿지 상태 머신 출력을 다음 순서로 publish해야 한다.
  1. `/cmd_vel` `geometry_msgs/Twist` 속도 0.
  2. `/mower/set_mode` `std_msgs/Int8` 값 `2`. 의미는 EMERGENCY mode이다.
  3. `/mower/engine` `std_msgs/Bool` 값 `false`. 의미는 가솔린 엔진 릴레이 강제 차단이다.
- Jetson은 emergency state에 진입하고, 향후 reset contract로 명시적인 reset이 오기 전까지 모든 일반 명령을 거부해야 한다. 현재 contract에서 reset은 backend 상태만 다루며 Jetson에 재개 명령을 보내지 않는다.
- reset-after-emergency는 엔진 릴레이를 자동으로 다시 켜거나 이전 주행/작업 장치 출력을 자동 복구하면 안 된다.
- 활성 control lock이 없어도 E-Stop은 수락해야 한다.

### Mode Command

Topic: `mowers/{robotId}/commands/mode`

QoS: 1

```json
{
  "commandId": "cmd-mode-001",
  "robotId": "<ROBOT_ID>",
  "commandType": "change-mode",
  "idempotencyKey": "mode-uuid",
  "lockVersion": 7,
  "clientSentAt": null,
  "requestedBy": "operator",
  "requestedAt": "2026-05-31T01:23:48.000Z",
  "priority": "normal",
  "parameters": {
    "mode": "autonomous"
  }
}
```

Rules:

- `mode`: `idle`, `manual`, `autonomous`, or `home`.
- Jetson must reject mode changes while emergency state is active.
- Mode change must not implicitly start drive or attachment output unless Jetson autonomous logic explicitly owns that behavior.

### Attachment Command

Topic: `mowers/{robotId}/commands/attachment`

QoS: 1

```json
{
  "commandId": "cmd-attachment-001",
  "robotId": "<ROBOT_ID>",
  "commandType": "mower-attachment",
  "idempotencyKey": "attachment-uuid",
  "lockVersion": 7,
  "clientSentAt": null,
  "requestedBy": "operator",
  "requestedAt": "2026-05-31T01:23:49.000Z",
  "priority": "normal",
  "parameters": {
    "attachmentAction": "blade-start"
  }
}
```

Rules:

- `attachmentAction`: `blade-start`, `blade-stop`, `raise`, or `lower`.
- Jetson must reject attachment commands while emergency state is active.
- E-Stop must cut blade output even if a previous attachment command started it.

## Telemetry Payload

Topic: `mowers/{robotId}/telemetry`

QoS: 1

Publish rate: nominal 1 Hz.

2026-10-21 확장: 각 메시지는 그 시점의 센서별 상태를 담는 스냅샷이다. 위치·배터리·모드·작업·속도·신호가 모두 준비될 때까지 기다리지 않는다. 미측정·미지원·더 이상 유효하지 않은 값은 `null`이며, 수신 측은 이를 이전 값이나 기본 숫자로 채우지 않는다. MQTT에서 측정 필드를 생략해도 `null`로 처리한다. 기존 숫자 메시지는 그대로 지원하며 명령·ACK 계약은 변경하지 않는다.

```json
{
  "robotId": "<ROBOT_ID>",
  "latitude": 37.50011,
  "longitude": 127.00011,
  "batteryLevel": 82,
  "mode": "manual",
  "workState": "mowing",
  "speedMps": 0.4,
  "signalStrength": 92,
  "receivedAt": "2026-05-31T01:23:50.000Z",
  "errorState": null
}
```

Field policy:

- `latitude`·`longitude`: 유효한 위치 한 쌍 또는 둘 다 `null`. 한쪽만 주어지면 위치 한 쌍을 `null`로 처리하고 다른 센서값은 유지한다.
- `batteryLevel`: 정수 `0..100` 또는 `null`. `0`은 실제 측정값이며 미수신 표시로 사용하지 않는다.
- `mode`: `idle`, `manual`, `autonomous`, `home`, `emergency` 또는 `null`.
- `workState`: `idle`, `mowing`, `paused`, `returning-home`, `error` 또는 `null`.
- `speedMps`: 지상 속도(m/s) 또는 `null`. 실제 정지 속도 `0`과 미수신을 구분한다.
- `signalStrength`: 정수 `0..100` 또는 `null`.
- `receivedAt`: Jetson timestamp when telemetry sample was produced.
- `errorState`는 nullable 기계 판독 코드다. 전체 Jetson 클라이언트의 `emergency-stop-active`는 소프트웨어 비상 정지 상태를 나타낸다.
- 선택 필드 `errorObserverSession`은 오류를 직접 관측하는 전체 클라이언트가 실행마다 새로 생성하는 UUID다. 같은 실행에서 활성 상태를 본 뒤 더 최신의 명시적인 `errorState: null`을 받으면 소프트웨어 해제로 기록한다. 상태 전용 모니터·기존 송신원·직접 이벤트를 발행하는 Edge Mock은 이 필드를 생략한다. 송신원 선언의 신뢰 경계는 기존 MQTT 장비 계정과 토픽 ACL이다.

현재 Jetson 클라이언트는 유효한 GPS fix가 최근 3초 미만에 도착한 경우에만 위치를 보낸다. 배터리·속도·신호의 실제 입력원은 아직 없어 `null`을 보낸다. 초기 모드·작업도 `null`이며 기존 명령 처리로 갱신되는 로컬 소프트웨어 상태를 STM32 실행 완료로 해석하지 않는다. 센서 미수신과 메시지 자체의 통신 두절은 별개다.

## Status Payload

Topic: `mowers/{robotId}/status`

QoS: 1

Publish rate: nominal every 3 seconds and immediately after command state changes.

```json
{
  "robotId": "<ROBOT_ID>",
  "connectionState": "online",
  "mqttState": "connected",
  "edgeState": "connected",
  "lastSeenAt": "2026-05-31T01:23:51.000Z",
  "stale": false
}
```

Field policy:

- `connectionState`: `online`, `degraded`, or `offline`.
- `mqttState`: `connected`, `reconnecting`, or `disconnected`.
- `edgeState`: `connected`, `monitoring`, `manual`, `autonomous`, `emergency`, or `fault`. `monitoring`은 명령 구독·ROS 제어 출력 없이 상태만 전송하는 프로그램이며 센서·STM32·예초 작업의 정상 동작을 의미하지 않는다.
- `stale`: true when Jetson considers upstream telemetry/control state stale.

## Event Payload

Topic: `mowers/{robotId}/events`

QoS: 1

Publish when an edge event occurs.

```json
{
  "id": "event-1717118631000",
  "robotId": "<ROBOT_ID>",
  "severity": "warning",
  "eventType": "obstacle-detected",
  "message": "Obstacle detected by front sensor.",
  "occurredAt": "2026-05-31T01:23:52.000Z",
  "source": "jetson"
}
```

Field policy:

- `severity`: `info`, `warning`, `error`, or `critical`.
- `eventType`: `job-event`, `obstacle-detected`, `communication-lost`, `sensor-fault`, `controller-error`, or `estop`.
- `message`: concise human-readable message for logs.
- `source`: `jetson`, `stm32`, `edge-mock`, or another stable component id.

## Command Ack Payload

Topic: `mowers/{robotId}/commands/ack`

QoS: 1

Jetson must publish one ack for every non-duplicate command it accepts, rejects, executes, or fails.

```json
{
  "commandId": "cmd-stop-001",
  "robotId": "<ROBOT_ID>",
  "commandType": "stop",
  "status": "accepted",
  "reason": null,
  "edgeNodeId": "jetson-<ROBOT_ID>",
  "receivedAt": "2026-05-31T01:23:46.020Z",
  "ackedAt": "2026-05-31T01:23:46.030Z"
}
```

Field policy:

- `commandId`: copied from command payload.
- `commandType`: copied from command payload.
- `status`: `accepted`, `rejected`, `executed`, or `failed`.
- `reason`: nullable machine-readable reason. Required for `rejected` and `failed`.
- `edgeNodeId`: stable Jetson process/client id.
- `receivedAt`: Jetson receive time.
- `ackedAt`: Jetson ack publish time.

Recommended ack sequence:

- For `manual-command`, publish `accepted` only when the command is fresh enough to apply. Publish `rejected` with `reason="stale-command"` if stale.
- For `stop` and `emergency-stop`, publish `accepted` immediately after the safety action is issued locally. A later `executed` ack may be added once STM32 confirms it.
- For mode and attachment commands, publish `accepted` after local validation and `failed` if STM32 bridge rejects the command.

## Jetson Processing Rules

1. Subscribe to all backend-to-edge command topics for its own `robotId`.
2. Reject any message whose topic robot id and payload `robotId` differ.
3. Validate `commandType`, `priority`, and command-specific parameters before forwarding to STM32.
4. Maintain recent `(robotId, idempotencyKey)` entries for QoS 1 duplicate suppression. If `idempotencyKey` is null, use `commandId`.
5. Treat `emergency-stop` as highest priority and preempt any queued or active command.
6. Do not queue manual commands. Keep only the most recent valid manual command.
7. Stop drive output when manual command freshness exceeds 500 ms.
8. Publish command ack on `mowers/{robotId}/commands/ack` with QoS 1.
9. Publish status immediately after emergency, stop, mode, attachment, connection, or fault state changes.
10. Never auto-resume a previous drive or attachment command after E-Stop reset.

## STM32 Serial Bridge Draft

This is a draft minimum line protocol between Jetson and STM32. It is not Jetson code.

Transport:

- UART serial
- UTF-8 line-delimited JSON
- One command per line, newline terminator `\n`
- STM32 should reply with one ack line per accepted/rejected command.

Jetson to STM32 command examples:

```json
{"type":"drive","commandId":"cmd-manual-001","direction":"forward","speed":0.6,"ttlMs":500}
```

```json
{"type":"stop","commandId":"cmd-stop-001","reason":"operator-stop"}
```

```json
{"type":"estop","commandId":"cmd-estop-001","reason":"operator emergency stop"}
```

```json
{"type":"mode","commandId":"cmd-mode-001","mode":"autonomous"}
```

```json
{"type":"attachment","commandId":"cmd-attachment-001","action":"blade-start"}
```

STM32 to Jetson ack examples:

```json
{"commandId":"cmd-stop-001","status":"accepted","reason":null,"timestamp":"2026-05-31T01:23:46.025Z"}
```

```json
{"commandId":"cmd-attachment-001","status":"rejected","reason":"emergency-active","timestamp":"2026-05-31T01:23:49.025Z"}
```

STM32 safety rules:

- If no valid drive command is received within `ttlMs`, drive PWM must return to neutral.
- E-Stop must force drive PWM neutral and disable mower attachment output.
- Serial payload should add checksum or framed CRC before field deployment; JSON line format is only the integration draft.

## 구현 정합성 검증 대상

다음 구현의 topic과 QoS는 이 계약과 일치해야 한다.

- `MqttTopicResolver`: 백엔드 topic 생성
- `MqttInboundSubscriber`: 백엔드 inbound wildcard 구독
- `edge/jetson-client/jetson_mower_client/main.py`: Jetson command 구독, ACK와 telemetry/status 발행
- `tools/edge-mock-client/src/index.js`: 로컬 통합 테스트용 publish/subscribe topic과 QoS

topic 계약을 변경할 때는 이 문서와 영향을 받는 구현을 같은 변경 단위에서 갱신한다.
## 수동 제어와 AUTO 실행 요청의 PC 준비 상태

### 수동 제어부의 요청 시 준비 — 2026-11-11

`mowers/{robotId}/commands/mode`(QoS 1, retain 없음)에 기존 명령 봉투의 `commandType:"manual-prepare"`, `parameters:{challenge:"<ONE_TIME_VALUE>"}`를 보낸다. 요청자·제어권 버전은 봉투에 유지한다. 확인값은 `manual-challenge`의 `purpose:"rearm"`으로 받고 2초 미만·1회 사용을 검사한다. 새 토픽이나 원격 셸 실행 API는 추가하지 않는다.

장비는 `commands/ack`에 같은 commandId로 `executing`을 먼저 보고하고, 포트를 열어 새 리모컨 개입·해제와 중립 진단을 확인한 뒤 `completed`를 보낸다. 이는 준비 보고이며 이동 출력이나 실제 바퀴 상태의 ACK가 아니다. 웹은 완료 뒤 새 확인값을 발급받아 `manual-rearm`을 별도 요청한다. 준비 중 방향 입력은 받지 않는다.

준비는 최대 30초, 준비 완료 후 재개 대기는 2초다. 점유 포트나 확인 실패는 `manual-port-busy-or-unverified`, 준비 한도 초과는 `manual-preparation-timeout`으로 거부한다. 일반 stop·estop·모드 변경·연결 단절은 준비를 취소하며 포트를 닫는다. 취소 시 연결되어 있으면 준비 명령에도 거부 ACK를 보내고, 최종 ACK가 없으면 서버는 35초가 지난 실행 중 준비를 시간 초과로 끝낸다. 기존 수동 이동 QoS 0과 일회용 확인값 검사를 유지한다.

관제 대기 클라이언트와 상태 전용 모니터를 같은 MQTT ID로 동시에 실행하지 않는다. 2026-11-11 별도 배포 폴더에 관제 대기를 설치하고 PC 백엔드를 갱신했다. MQTT 연결과 구독 요청을 확인했으며 웹 버전·새 서비스의 실제 준비와 물리 동작 검증은 남아 있다. 설치 결과는 Jetson README를 따른다.

### AUTO 실행 준비

Jetson 제어 클라이언트의 기존 `mowers/{robotId}/commands/mode` 입력에서 `parameters.mode=autonomous`는 설정된 실행 관리자에 요청한다. 새 토픽이나 임의 셸 명령 입력은 추가하지 않았다. 현재 명령 미설정과 준비 확인 미연결이 기본이므로 `rejected`를 반환한다. `autonomy-not-configured`, `autonomy-readiness-unknown`, `autonomy-not-ready`, `autonomy-already-running`, `autonomy-end-unconfirmed`, `autonomy-launch-failed`, `autonomy-stop-unconfirmed`는 실행 거부·확인 불가 사유다. 향후 어댑터 연결 후 프로세스 생성에 성공하면 `accepted`와 `autonomy-process-started`로 응답하며 실제 주행 시작이나 작업 완료를 뜻하지 않는다.

기존 status의 `edgeState`에는 관리 중인 실행의 `autonomy-awaiting-start`, `autonomy-running`, `autonomy-end-unconfirmed`, `autonomy-stop-unconfirmed` 등이 표시될 수 있다. 여기서 running은 외부 확인 어댑터가 실제 시작을 확인했을 때의 상태이며 현재 해당 어댑터는 미연결이다. 서버 작업 이력 입력·GPS 측정 신호와의 외부 전송 계약도 미연결이다. 상태 전용 모니터는 계속 명령을 구독하지 않는다. 실제 MQTT 브로커·Jetson 적용·물리 동작은 이번 PC 코드 검증 범위가 아니다.
