# 텔레메트리 코드 흐름

## 1. 이 기능이 하는 일

텔레메트리(Telemetry)는 로봇의 위치, 배터리, 모드, 작업 상태를 장비에서 관제 서버로 보내는 상태 데이터다. 이 프로젝트에서는 같은 메시지를 DB에 보관하고 STOMP로 화면에도 전달한다.

## 2. 전체 시퀀스

```text
Jetson 또는 Edge Mock
  -> MQTT mowers/<ROBOT_ID>/telemetry (QoS 1)
  -> MqttInboundSubscriber.messageArrived()
  -> MqttInboundHandler.handleTelemetry()
     -> MqttInboundPersistenceService.persistTelemetry()
     -> TelemetryLogRepository.save()
     -> RealtimePublisher.publishTelemetry()
  -> STOMP /topic/robots/<ROBOT_ID>/telemetry
  -> RealtimeProvider
  -> telemetryStore.upsertTelemetry()
  -> TelemetryPanel
```

마지막 두 단계는 의도된 흐름이며 현재 프론트엔드에서는 완전히 연결되지 않았다.

## 3. Jetson 처리

`JetsonMowerClientNode`는 ROS 2의 `/fix`와 `/camera/imu`를 구독한다.

- `_handle_fix()`는 최신 GPS 메시지를 보관한다.
- `_handle_imu()`는 최신 IMU 메시지를 보관하지만 현재 payload 계산에는 사용하지 않는다.
- `_publish_telemetry()`가 주기적으로 MQTT payload를 만든다.
- GPS가 없으면 위도와 경도를 `0.0`으로 보낸다.
- 배터리와 신호 세기는 설정의 기본값을 사용한다.
- 속도는 현재 `0.0`으로 고정돼 있다.

```json
{
  "robotId": "<ROBOT_ID>",
  "latitude": 37.0001,
  "longitude": 127.0001,
  "batteryLevel": 80,
  "mode": "idle",
  "workState": "idle",
  "speedMps": 0.0,
  "signalStrength": 100,
  "receivedAt": "2026-01-01T00:00:00Z",
  "errorState": null
}
```

## 4. 백엔드 처리

`MqttInboundSubscriber`는 `mowers/+/telemetry`를 구독한다.

1. topic의 robot ID와 payload의 `robotId`가 같은지 확인한다.
2. JSON을 `MqttTelemetryPayload`로 변환한다.
3. `MqttInboundHandler.handleTelemetry()`를 호출한다.
4. persistence service는 등록된 로봇인지 확인하고 위치를 PostGIS `Point`로 변환한다.
5. `TelemetryLogRepository`가 `telemetry_log`에 저장한다.
6. 같은 handler가 `RealtimePublisher`로 STOMP 메시지를 발행한다.

DB에는 로봇 FK, 위치 Point, 배터리, 상태, 기록 시각이 저장된다.

## 5. 프론트엔드 처리와 현재 단절 지점

`stompClient.subscribeToRobotTopics()`는 telemetry handler를 전달받으면 `/topic/robots/{id}/telemetry`를 구독할 수 있다. `telemetryStore`에도 `upsertTelemetry()`가 구현돼 있다.

하지만 현재 `RealtimeProvider`가 전달하는 handler는 다음 세 개뿐이다.

```text
controlLock: 빈 함수
status: 빈 함수
events: 빈 함수
telemetry: 전달하지 않음
```

따라서 백엔드가 정상 발행해도 store가 갱신되지 않는다. `telemetryStore`의 초기값도 `mockTelemetry`이므로 운영자가 Mock 값을 실제 상태로 오해할 수 있다.

## 6. 실제 검증에서 확인한 내용

- Edge Mock 실행 중 `telemetry_log`가 약 1초 간격으로 증가했다.
- 3초 동안 3개 레코드가 추가되는 것을 확인했다.
- 백엔드는 MQTT 수신 후 DB 저장과 STOMP 발행을 수행했다.
- 프론트엔드 화면 상태는 실제 수신값과 연결되지 않았다.

## 7. 디버깅 방법

1. Edge Mock 또는 Jetson 로그에서 telemetry publish를 확인한다.
2. Mosquitto에서 `mowers/+/telemetry`를 구독해 raw JSON을 확인한다.
3. 백엔드가 unknown robot 또는 robot ID mismatch를 기록하는지 확인한다.
4. `telemetry_log`의 최근 행을 조회한다.
5. 브라우저 WebSocket frame에서 STOMP telemetry message를 확인한다.
6. `RealtimeProvider` handler와 `telemetryStore` 변경 여부를 확인한다.

## 8. 권장 파일 읽기 순서

1. `edge/jetson-client/jetson_mower_client/main.py`
2. `backend/src/main/java/com/autonomousmower/mqtt/service/MqttInboundSubscriber.java`
3. `backend/src/main/java/com/autonomousmower/mqtt/service/MqttInboundHandler.java`
4. `backend/src/main/java/com/autonomousmower/mqtt/service/MqttInboundPersistenceService.java`
5. `backend/src/main/java/com/autonomousmower/telemetry/entity/TelemetryLog.java`
6. `backend/src/main/java/com/autonomousmower/realtime/service/RealtimePublisher.java`
7. `frontend/src/shared/realtime/stompClient.ts`
8. `frontend/src/app/providers/RealtimeProvider.tsx`
9. `frontend/src/features/telemetry/telemetryStore.ts`
