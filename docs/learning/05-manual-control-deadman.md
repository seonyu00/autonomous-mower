# 수동 조종과 데드맨 스위치 코드 흐름

## 1. 이 기능이 하는 일

수동 조종은 방향과 속도를 로봇에 전달한다. 데드맨 스위치(Deadman Switch)는 브라우저, 백엔드 또는 네트워크가 멈췄을 때 마지막 주행 명령이 계속 유지되지 않도록 500ms 뒤 정지시키는 방어다.

## 2. 수동 명령 시퀀스

```text
ManualJoystick.onPointerDown
  -> 최신 입력 저장 및 100ms 반복 tick
  -> 진행 중인 이동 요청이 없을 때만 전송
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
- 포인터 캡처 상실
- 제어 비활성화, 로봇 전환, 컴포넌트 해제
- window `blur`
- `pagehide`
- `beforeunload`
- document가 hidden으로 변경

2026-09-15 조이스틱 수정에서는 누르는 동안 100ms마다 최신 입력을 전송한다. 이동 HTTP 요청은 한 개만 진행하고 중간 입력은 큐에 쌓지 않는다. 놓기·취소·비활성화·로봇 전환 시 반복을 끝내며, 로봇 전환에서는 이전 로봇 ID로 정지를 시도한다. 이 정지 경로는 선택 검사만 생략하고 인증·권한·제어권 소유자·HTTPS 준비 검사를 유지한다.

정지 요청은 이동 응답을 기다리지 않으며 한 개만 진행한다. 이전 이동 요청이 정지 이후 늦게 끝나면 정지를 추가 시도한다. 요청이 남은 동안 새 누르기는 이동을 시작하지 않으며, 요청 종료 후 다시 눌러야 한다. 무한 대기 HTTP의 시간 제한은 이번에 추가하지 않았으나 대기 요청 수를 제한한다. 기존 `DeadmanSwitch` 유틸리티는 남아 있지만 조이스틱은 단발 500ms 타이머 대신 입력 반복 수명을 관리한다. 백엔드 데드맨은 그대로 유지한다.

관련 가짜 전송·가짜 시계 회귀 테스트를 작업 8의 제어권·ACK 변경과 함께 실행했다. 프론트 55개·백엔드 55개 및 TypeScript·프론트 빌드·ESLint·bootJar가 통과했다. 실제 명령 발행은 하지 않았다.

## 4. 백엔드 데드맨

`ControlCommandService.manual()`은 명령을 발행하기 전에 `DeadmanService.recordCommand()`를 호출한다. scheduler는 100ms 주기로 추적 중인 로봇을 검사한다.

마지막 명령 이후 500ms가 지나면:

1. `ControlStateStore.consumeDeadmanTimeout()`이 한 번만 timeout을 소비한다.
2. system 사용자가 만든 stop 명령을 MQTT QoS 1로 발행한다.
3. 작업 8-3부터는 해당 stop 명령 ID의 추적 이벤트를 사용하며 별도 ID의 synthetic 접수 이벤트를 추가 발행하지 않는다.

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
- 반복 전송과 정지 시도를 가짜 전송·시계 회귀 테스트로 검증했다. 브라우저 종료·통신 단절 시 HTTP 정지 전달과 HTTP/MQTT 간 처리 순서를 보장하지 않는다. 실제 정지 완료나 실행 완료 ACK를 만들어내지 않는다. 명령 순서·만료 및 장비 실행 완료 응답 계약이 필요한 부분은 미구현이며 하드웨어 담당 팀원 협의 항목이다.
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

## 작업 8 공통 제한

받은 하드웨어 코드와 MQTT·STM32 계약은 변경하지 않는다.
현재 장비가 보내지 않는 실행 완료 응답을 만들어내지 않는다.
계약 변경이 필요한 부분은 미구현으로 구분하고 팀원 협의 항목으로 남긴다.
2026-09-15 검증은 실제 명령 발행 없이 가짜 전송 계층을 사용했다. 2026-10-06에는 실장비와 분리된 전용 PC 브로커에서 새 수동 입력이 끊기면 deadman-timeout·speed=0 정지가 수신됨을 확인했다. STM32 출력과 물리 정지는 별도 검증이 필요하다.
