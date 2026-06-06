# MQTT ACK lifecycle

ACK lifecycle은 명령을 보냈다는 사실과 장비가 실제로 처리했다는 사실을 구분하기 위한 상태 추적이다.

## 상태 흐름

```text
SENT
  -> ACKED
  -> EXECUTING
  -> COMPLETED

실패 경로: FAILED
시간 초과: TIMED_OUT
```

## 처리 순서

```text
Backend MQTT publish
  -> command_execution SENT 저장
  -> Jetson 명령 수신
  -> mowers/<ROBOT_ID>/commands/ack
  -> CommandExecutionService
  -> DB 상태 변경
  -> STOMP control-events 발행
```

## ACK 예제

```json
{
  "robotId": "<ROBOT_ID>",
  "commandId": "cmd-example-001",
  "status": "accepted",
  "reason": null,
  "reportedAt": "2026-01-01T00:00:00Z"
}
```

## 현재 제한

- Edge Mock과 Jetson은 주로 `accepted` ACK를 보낸다.
- STM32의 실제 모터·릴레이 수행 결과가 `completed`까지 연결되지 않았다.
- `ACKED` 상태도 5초 안에 완료되지 않으면 `TIMED_OUT`이 된다.
- MQTT publish 후 DB에 `SENT`를 기록하므로 매우 빠른 ACK가 먼저 도착할 가능성이 있다.
- 완료 이후 늦은 ACK처럼 역행하는 상태 전이를 막는 검증이 부족하다.
- 프론트엔드는 REST 응답 후 대기 표시를 해제하며 최종 ACK 상태를 제어 UI에 충분히 반영하지 않는다.

`accepted`는 Jetson이 명령을 받았다는 의미이지 실제 모터가 움직이거나 정지했다는 증명이 아니다.
