# MQTT ACK lifecycle 코드 흐름

## 1. 이 기능이 하는 일

ACK lifecycle은 서버가 명령을 발행한 사실과 장비가 실제로 수신·실행한 사실을 구분해 기록한다.

```text
SENT -> ACKED -> EXECUTING -> COMPLETED
                    \-> FAILED
SENT/ACKED/EXECUTING -> TIMED_OUT
```

## 2. 명령 발행 시퀀스

```text
Control Service
  -> MqttCommandPublisher.publish*Command()
  -> ObjectMapper.writeValueAsBytes()
  -> MqttTransport.publish()
  -> CommandExecutionService.markSent()
  -> command_execution INSERT status=SENT
  -> STOMP control-events
```

중요한 점은 현재 코드가 DB 저장보다 MQTT publish를 먼저 한다는 것이다.

## 3. ACK 수신 시퀀스

```text
Jetson _publish_ack()
  -> MQTT mowers/<ROBOT_ID>/commands/ack (QoS 1)
  -> MqttInboundSubscriber
  -> MqttInboundHandler.handleCommandAck()
  -> CommandExecutionService.applyAck()
  -> CommandExecution.applyAck()
  -> command_execution UPDATE
  -> STOMP control-events
```

상태 문자열 매핑:

| MQTT status | DB status |
|---|---|
| `accepted`, `acked` | `ACKED` |
| `executing` | `EXECUTING` |
| `executed`, `completed` | `COMPLETED` |
| `rejected`, `failed` | `FAILED` |
| `timeout`, `timed_out` | `TIMED_OUT` |

## 4. timeout 처리

`CommandExecutionService.markTimedOutCommands()`는 1초마다 실행된다. `sentAt`이 5초보다 오래됐고 상태가 `SENT`, `ACKED`, `EXECUTING`이면 `TIMED_OUT`으로 변경한다.

따라서 accepted ACK를 받았어도 completed ACK가 없으면 5초 후 timeout이 된다. 이때 reason은 항상 `ack-timeout`이어서 “ACK 자체가 없었다”는 의미로 오해할 수 있다.

## 5. 실제 검증에서 확인한 내용

- Edge Mock 명령은 처음 `ACKED`가 됐다.
- completed ACK가 없자 약 5초 후 `TIMED_OUT`으로 바뀌었다.
- 별도로 completed ACK를 발행한 명령은 `COMPLETED`가 됐고 6초 뒤에도 유지됐다.
- Jetson과 Edge Mock은 현재 주로 `accepted`만 발행한다.

## 6. 현재 경쟁 조건과 상태 문제

- MQTT publish 후 `markSent()`를 호출한다. 매우 빠른 ACK가 DB INSERT보다 먼저 도착하면 unknown command로 무시될 수 있다.
- `CommandExecution.applyAck()`에는 상태 전이 제한이 없다. 늦은 accepted ACK가 `COMPLETED`를 다시 `ACKED`로 낮출 수 있다.
- timeout 이후 늦은 ACK도 상태를 다시 변경할 수 있다.
- ACK의 `robotId`와 저장된 명령의 robot ID 또는 command type을 대조하지 않는다.
- idempotency key는 저장하지만 중복 명령 조회에 사용하지 않는다.
- 프론트엔드는 REST 응답 후 pending 상태를 해제하며 control-events의 최종 lifecycle을 UI에 연결하지 않는다.

## 7. ACK가 증명하는 범위

현재 `accepted`는 Jetson이 JSON을 검증하고 ROS 2 publish를 시도했다는 수준이다. STM32가 명령을 수신했거나 실제 PWM·릴레이 출력이 적용됐다는 뜻은 아니다. 실제 장비 완료 상태를 만들려면 STM32 ACK를 Jetson과 백엔드까지 전달해야 한다.

## 8. 권장 파일 읽기 순서

1. `backend/src/main/java/com/autonomousmower/mqtt/service/MqttCommandPublisher.java`
2. `backend/src/main/java/com/autonomousmower/control/service/CommandExecutionService.java`
3. `backend/src/main/java/com/autonomousmower/control/entity/CommandExecution.java`
4. `backend/src/main/java/com/autonomousmower/mqtt/service/MqttInboundSubscriber.java`
5. `edge/jetson-client/jetson_mower_client/command_ack.py`
6. `edge/jetson-client/jetson_mower_client/main.py`
