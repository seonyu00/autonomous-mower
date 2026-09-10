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

2026-09-10 코드 확인 기준으로 `RealtimeProvider`는 telemetry/status 메시지를 파싱해 store에 반영한다. 아래 6절의 과거 검증 결과와 현재 구현을 구분한다.

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

DB에는 로봇 FK, 위치 Point, 배터리, 상태, 기록 시각이 저장된다. `MqttInboundHandler` 진입 시 주입된 `Clock`으로 서버 수신 시각을 잡아 DB와 STOMP `lastReceivedAt`에 함께 사용한다. Edge의 MQTT `receivedAt`은 `edgeSampledAt`으로 별도 전달하며 지연 판정에는 사용하지 않는다.

`TelemetryReceptionService`는 로봇별 마지막 수신을 메모리에 보관하고 250ms 주기로 검사한다. 마지막 서버 수신 후 3초 이상이면 `delayed`, 새 텔레메트리 수신 시 `normal`로 전환한다. 서버 프로세스 시작 후 미수신 로봇은 `never-seen`이며 시간 경과만으로 지연 이벤트를 만들지 않는다. 조회 응답과 STOMP status에 `telemetryReception`을 포함하므로 새 브라우저도 현재 상태를 확인할 수 있다.

지연과 복구 전이만 DB 이벤트로 한 번씩 저장한다. Edge status가 계속 오더라도 텔레메트리 수신 시각은 갱신하지 않는다. 동일 Edge 상태의 반복 메시지도 시각을 제외한 상태 필드로 비교해 DB 중복 기록을 막는다. 이 감시는 표시·기록용이며 물리 정지나 MQTT 명령을 발행하지 않는다.

## 5. 프론트엔드 처리

`RealtimeProvider`는 선택 로봇과 인증 토큰이 있을 때 telemetry, status, events, controlLock, controlEvents 구독을 구성한다. `parseTopicMessage()`와 `applyRealtimeMessage()`가 텔레메트리·상태·제어 메시지를 해당 store에 반영한다. 일반 events는 payload와 topic의 로봇 ID를 검증한 뒤 `recentEventsStore`에 합치고 최근 경고 및 이벤트 패널에 반영한다. 초기 목록은 기존 로그 API로 조회하며 이벤트 ID 중복과 이전 로봇·세션의 늦은 조회 응답을 제외한다.

로봇과 텔레메트리는 빈 상태에서 시작한다. 실제 로봇 조회 실패는 목록에 오류를 표시하고 샘플로 대체하지 않는다. 선택 로봇은 있으나 telemetry가 없으면 수신 대기를 표시한다. 개발 환경에서 `VITE_ENABLE_MOCK_REALTIME=true`를 명시했을 때만 샘플 텔레메트리를 공급한다. 운영 빌드는 이 값을 무시한다.

상태 패널은 `useTelemetryReception`으로 서버가 제공한 경과 시간과 브라우저에서 흐른 시간을 합산해 미수신·정상·지연을 표시한다. 메시지가 끊겨도 250ms 타이머와 탭 복귀 시 갱신하며 로봇별 수신 시각을 분리한다.

지도와 상태 패널은 `telemetryStore.dataSource`로 샘플 여부를 구분한다. 연결 상태 변화나 GPS 미수신을 이유로 샘플 경로·위치를 표시하지 않는다. 로그아웃 시 store와 조회 캐시를 비우고 이전 세션의 늦은 구독·조회 응답을 무시한다.

## 6. 과거 실제 검증에서 확인한 내용

아래는 기존 기록을 보존한 것이며 2026-09-10 실행 결과가 아니다. 이번 작업에서는 모의 API·구독을 사용하는 프론트 테스트만 실행하고 실제 장비·운영 서비스에는 연결하지 않았다.

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
