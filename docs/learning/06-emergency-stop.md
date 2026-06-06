# 긴급 정지 코드 흐름

## 1. 이 기능이 하는 일

긴급 정지(E-Stop)는 일반 제어권과 관계없이 로봇의 주행과 작업 장치를 최대한 빠르게 중단시키는 명령이다. 현재 구현은 백엔드 상태, MQTT, Jetson ROS 2 출력까지 연결된다.

## 2. 활성화 시퀀스

```text
EmergencyStopButton
  -> controlApi.emergencyStop()
  -> POST /api/control/<ROBOT_ID>/estop
  -> ControlController.estop()
  -> EmergencyStopService.activate()
     -> ControlStateStore.activateEmergency()
     -> MqttCommandPublisher.publishEmergencyStop(QoS 1)
     -> STOMP control-lock/control-event
  -> JetsonMowerClientNode._handle_estop()
     -> zero /cmd_vel
     -> /mower/set_mode = 2
     -> /mower/engine = false
     -> accepted ACK
```

Jetson의 `publish_emergency_stop_outputs()`는 주행 정지, emergency mode, engine false 순서로 출력한다.

## 3. 백엔드 안전 규칙

- `control:write` 권한은 필요하지만 현재 제어권 소유자일 필요는 없다.
- 긴급 상태가 되면 mode도 `emergency`로 바뀐다.
- 긴급 상태에서는 manual, mode, attachment 명령이 거부된다.
- reset은 소유자 또는 `control:takeover` 권한 사용자가 수행한다.
- reset 후 이전 주행 명령을 자동 재개하지 않는다.

## 4. 공개용 요청 예제

```http
POST /api/control/<ROBOT_ID>/estop
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "idempotencyKey": "estop-example-001",
  "reason": "operator requested emergency stop"
}
```

## 5. 실제 검증에서 확인한 내용

- E-Stop 요청은 HTTP 200으로 수락됐다.
- E-Stop 이후 manual 요청은 HTTP 409로 거부됐다.
- Jetson test는 zero Twist, emergency mode 값 `2`, engine `false`의 출력 순서를 검증한다.
- Edge Mock은 E-Stop 수신 후 telemetry 상태를 ERROR로 발행했다.

## 6. reset의 중요한 단절

`EmergencyStopService.reset()`은 다음 작업만 수행한다.

1. 백엔드 `ControlStateStore`의 emergency 값을 false로 바꾼다.
2. STOMP control-lock 상태를 발행한다.
3. reset 요청이 수락됐다는 control event를 발행한다.

MQTT reset 명령은 발행하지 않는다. 실제 실험에서도 백엔드 reset 후 Edge Mock은 계속 emergency 상태였고 telemetry도 ERROR로 남았다. Mock을 재시작한 뒤에야 정상 상태로 돌아왔다.

즉, 현재 reset은 장비 복구가 아니라 서버 상태 초기화에 가깝다.

## 7. 추가 위험

`activate()`는 백엔드 emergency 상태를 먼저 변경한 뒤 MQTT를 발행한다. broker 장애로 publish가 실패하면 서버만 긴급 상태이고 장비에는 명령이 전달되지 않았을 수 있다.

또한 `accepted` ACK는 Jetson이 명령을 받았다는 의미다. STM32와 실제 모터·릴레이가 정지했다는 증명은 아니다.

## 8. 권장 파일 읽기 순서

1. `frontend/src/features/control/EmergencyStopButton.tsx`
2. `frontend/src/features/control/controlApi.ts`
3. `backend/src/main/java/com/autonomousmower/control/controller/ControlController.java`
4. `backend/src/main/java/com/autonomousmower/control/service/EmergencyStopService.java`
5. `backend/src/main/java/com/autonomousmower/control/model/ControlStateStore.java`
6. `edge/jetson-client/jetson_mower_client/main.py`
7. `edge/jetson-client/jetson_mower_client/hardware_safety.py`
