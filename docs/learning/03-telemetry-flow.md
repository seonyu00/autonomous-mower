# 텔레메트리 흐름

텔레메트리(Telemetry)는 로봇의 위치, 배터리, 상태처럼 장비에서 관제 서버로 보내는 상태 데이터다.

## 처리 순서

```text
Jetson 또는 Edge Mock
  -> mowers/<ROBOT_ID>/telemetry
  -> Mosquitto
  -> MqttInboundSubscriber
  -> MqttInboundHandler
  -> MqttInboundPersistenceService
  -> telemetry_log
  -> RealtimePublisher
  -> /topic/robots/<ROBOT_ID>/telemetry
  -> React Dashboard
```

## MQTT 예제

Topic:

```text
mowers/<ROBOT_ID>/telemetry
```

Payload:

```json
{
  "robotId": "<ROBOT_ID>",
  "latitude": 37.0001,
  "longitude": 127.0001,
  "battery": 80,
  "state": "IDLE",
  "recordedAt": "2026-01-01T00:00:00Z"
}
```

## 현재 구현 상태

- Edge Mock에서 발행한 텔레메트리가 백엔드와 DB까지 저장되는 흐름은 동작한다.
- 백엔드는 STOMP topic으로 실시간 메시지를 발행한다.
- 프론트엔드 `RealtimeProvider`가 수신값을 telemetry store에 완전히 반영하지 않아 화면에는 Mock 값이 남을 수 있다.
- Jetson은 GPS 값을 반영하지만 배터리, 속도, 신호 세기 일부는 기본값 또는 후속 구현 대상이다.

## 읽을 파일

1. `edge/jetson-client/jetson_mower_client/main.py`
2. `backend/src/main/java/com/autonomousmower/mqtt/service/MqttInboundSubscriber.java`
3. `backend/src/main/java/com/autonomousmower/mqtt/service/MqttInboundHandler.java`
4. `backend/src/main/java/com/autonomousmower/mqtt/service/MqttInboundPersistenceService.java`
5. `frontend/src/app/providers/RealtimeProvider.tsx`
6. `frontend/src/features/telemetry/telemetryStore.ts`
