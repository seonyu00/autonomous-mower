# 수동 조종과 데드맨 스위치

데드맨 스위치(Deadman Switch)는 조작 입력이 끊겼을 때 로봇을 자동 정지시키는 안전 기능이다.

## 명령 흐름

```text
ManualJoystick
  -> POST /api/control/<ROBOT_ID>/manual
  -> ControlCommandService
  -> MqttCommandPublisher
  -> mowers/<ROBOT_ID>/commands/manual
  -> Jetson
  -> geometry_msgs/Twist
  -> /cmd_vel
```

수동 명령은 오래된 입력이 쌓이지 않도록 MQTT QoS 0을 사용한다.

## 명령 예제

```json
{
  "action": "manual",
  "robotId": "<ROBOT_ID>",
  "direction": "forward",
  "speed": 0.4,
  "idempotencyKey": "manual-example-001",
  "lockVersion": 1,
  "clientSentAt": "2026-01-01T00:00:00Z"
}
```

## 세 단계 정지 방어

1. 브라우저는 버튼을 놓거나 창이 비활성화되면 정지 요청을 보낸다.
2. 백엔드는 마지막 입력 이후 500ms가 지나면 MQTT 정지 명령을 보낸다.
3. Jetson은 수동 명령이 500ms 동안 없으면 로컬에서 `/cmd_vel` 속도를 0으로 만든다.

STM32의 독립 watchdog은 아직 구현되지 않았다. 따라서 실제 장비 안전 체인은 완성되지 않았다.

## 현재 동작상 주의점

- 조이스틱을 누르고 있는 동안 명령을 연속 발행하지 않아 약 500ms 후 정지할 수 있다.
- 명시적 정지 명령도 백엔드 데드맨 시간을 갱신해 추가 정지 명령이 한 번 더 발생할 수 있다.
- 프론트엔드의 `reverse`와 계약의 `backward` 용어가 통일되지 않았다.
