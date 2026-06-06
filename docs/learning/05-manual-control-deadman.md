# 수동 조종과 데드맨 스위치 코드 흐름

## 1. 이 기능이 하는 일

수동 조종은 방향과 속도를 로봇에 전달한다. 데드맨 스위치(Deadman Switch)는 브라우저, 백엔드 또는 네트워크가 멈췄을 때 마지막 주행 명령이 계속 유지되지 않도록 500ms 뒤 정지시키는 방어다.

## 2. 수동 명령 시퀀스

```text
ManualJoystick.onPointerDown
  -> sendDirection()
  -> DeadmanSwitch.reset()
  -> controlApi.sendManualCommand()
  -> POST /api/control/<ROBOT_ID>/manual
  -> ControlController.manual()
  -> ControlCommandService.manual()
     -> requireOwnerAndOperational()
     -> DeadmanService.recordCommand()
     -> MqttCommandPublisher.publishManualCommand(QoS 0)
  -> JetsonMowerClientNode._handle_manual()
     -> stale/emergency 검사
     -> manual_to_twist()
     -> /cmd_vel publish
     -> accepted ACK
```

## 3. 브라우저 정지 방어

`ManualJoystick`은 다음 경우 `sendStopCommand()`를 호출한다.

- `pointerup`
- `pointercancel`
- 500ms local timer 만료
- window `blur`
- `pagehide`
- `beforeunload`
- document가 hidden으로 변경

현재 `pointerdown`에서 한 번만 manual 명령을 보낸다. 버튼을 계속 누르고 있어도 주기적으로 갱신하지 않으므로 약 500ms 뒤 브라우저 또는 Jetson timeout으로 정지한다.

## 4. 백엔드 데드맨

`ControlCommandService.manual()`은 명령을 발행하기 전에 `DeadmanService.recordCommand()`를 호출한다. scheduler는 100ms 주기로 추적 중인 로봇을 검사한다.

마지막 명령 이후 500ms가 지나면:

1. `ControlStateStore.consumeDeadmanTimeout()`이 한 번만 timeout을 소비한다.
2. system 사용자가 만든 stop 명령을 MQTT QoS 1로 발행한다.
3. STOMP에 synthetic `deadman-timeout` 이벤트를 발행한다.

현재 `ControlCommandService.stop()`도 `recordCommand()`를 호출하므로 명시적 stop 이후 약 500ms 뒤 system stop이 한 번 더 발생할 수 있다.

## 5. Jetson 로컬 데드맨

Jetson은 `_last_manual_command_monotonic`에 마지막 manual 수신 시각을 저장한다. 0.1초 timer가 경과 시간을 확인하고 설정된 500ms를 넘으면 zero `Twist`를 `/cmd_vel`에 발행한다.

`manual_to_twist()`는 속도를 0~1로 제한하고 설정된 최대 선속도·각속도에 곱한다. `backward`와 `reverse`를 모두 허용한다.

## 6. 실제 검증에서 확인한 내용

- manual 명령이 Edge Mock에 도착한 뒤 system stop이 약 564ms 후 도착했다.
- 브라우저 정지와 별개로 백엔드 timeout이 동작했다.
- Jetson unit test에서 timeout 시 zero `/cmd_vel` 출력이 검증됐다.
- 실제 STM32 PWM 중립 출력은 검증되지 않았다.

## 7. 안전상 남은 문제

- STM32 독립 watchdog이 없다. Jetson 이후 통신이 끊기면 실제 모터 정지를 보장할 수 없다.
- 계속 누르는 조작을 유지하려면 manual 명령을 500ms보다 빠른 주기로 갱신해야 하지만 현재 UI에는 반복 전송이 없다.
- 백엔드는 속도 범위를 검증하지만 방향 값은 Jetson에서 최종 검증한다.
- 프론트엔드는 `reverse`, MQTT 계약은 주로 `backward`를 사용해 용어가 일치하지 않는다.

## 8. 권장 파일 읽기 순서

1. `frontend/src/features/control/ManualJoystick.tsx`
2. `frontend/src/features/control/DeadmanSwitch.ts`
3. `frontend/src/features/control/controlApi.ts`
4. `backend/src/main/java/com/autonomousmower/control/service/ControlCommandService.java`
5. `backend/src/main/java/com/autonomousmower/control/service/DeadmanService.java`
6. `backend/src/main/java/com/autonomousmower/control/model/ControlStateStore.java`
7. `backend/src/main/java/com/autonomousmower/mqtt/service/MqttCommandPublisher.java`
8. `edge/jetson-client/jetson_mower_client/main.py`
9. `edge/jetson-client/jetson_mower_client/command_mapping.py`
