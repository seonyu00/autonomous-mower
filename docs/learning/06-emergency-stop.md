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

## 8. 2026-11-15 하드웨어 인수인계 자료 대조

`채장우_인수인계` 폴더의 2026-11-09 PDF 설명서 전체와 `HD-7000W_handoff_for_LLM.md`, 함께 전달된 `firmware/main.c`를 확인했다. PDF 4~5쪽은 엔진과 릴레이 구조, 9~11쪽은 비상 모드와 통신 감시를 설명한다. 아래는 인계 자료와 펌웨어 파일의 내용이며 현재 장비에 설치된 펌웨어·배선이나 물리 동작을 새로 확인한 결과는 아니다. PDF 10쪽은 10월 27일 버전이 설치되어 있다고 적지만 LLM용 인계 문서는 설치 여부를 추정으로 표시하므로 현재 버전은 별도 확인이 필요하다.

- 가솔린 엔진과 예초날은 사람이 직접 켜고 끈다고 설명한다. 전달된 펌웨어의 엔진 필드는 파싱되지만 엔진을 제어하는 출력은 확인되지 않는다. 위 ROS `engine=false` 발행만으로 실제 엔진이나 날이 정지했다고 표시할 수 없다.
- 릴레이가 꺼지면 모터 드라이버가 리모컨 수신기에 연결되는 구성이다. 전달된 펌웨어는 패킷이 500ms 넘게 없으면 릴레이를 끄고 리모컨 경로로 전환한다. 이는 SRS N-01의 통신 단절 시 모든 구동 정지 요구사항과 대조해 담당자 확인이 필요한 차이다. 리모컨 경로로 전환된다는 설명만으로 실제 바퀴의 정지 여부는 판단할 수 없다.
- 전달된 펌웨어에서 모드 2는 릴레이를 끄고 내부 좌우 값을 1500으로 설정한다. 이때 드라이버는 인계된 배선 구조상 리모컨 경로로 돌아간다. 웹 비상 정지가 현장 리모컨과 엔진까지 차단하는지는 확인되지 않았다.
- 리모컨 조작을 감지하면 마지막 조작 후 5초 동안 리모컨 경로를 유지한다. 인계 자료는 통신 복구 후 새 AUTO 패킷을 받으면 펌웨어가 즉시 AUTO로 들어갈 수 있고, 별도의 복구 잠금이 없다고 설명한다. 실제 설치 버전과 웹 게이트웨이·주행 프로그램의 중재를 함께 확인해야 한다.
- 자료는 STM32 하드웨어 워치독과 드라이버 자체 통신 타임아웃을 확인할 필요가 있다고 기록한다. 전원이 켜진 상태의 배선 변경으로 예상하지 못한 이동과 드라이버 입력 손상이 발생한 과거 사례도 기록한다.
- 담당자에게 실제 설치 펌웨어, 릴레이와 엔진 배선, 물리 비상정지 범위, 리모컨 개입 및 통신 복구 후 동작을 확인한다. 실장비 시험은 바퀴·날 격리와 담당자 확인을 거쳐 별도로 수행한다.

## 9. 권장 파일 읽기 순서

1. `frontend/src/features/control/EmergencyStopButton.tsx`
2. `frontend/src/features/control/controlApi.ts`
3. `backend/src/main/java/com/autonomousmower/control/controller/ControlController.java`
4. `backend/src/main/java/com/autonomousmower/control/service/EmergencyStopService.java`
5. `backend/src/main/java/com/autonomousmower/control/model/ControlStateStore.java`
6. `edge/jetson-client/jetson_mower_client/main.py`
7. `edge/jetson-client/jetson_mower_client/hardware_safety.py`
