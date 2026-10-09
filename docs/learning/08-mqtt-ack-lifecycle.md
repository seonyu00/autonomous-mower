# MQTT ACK lifecycle 코드 흐름

## 1. 이 기능이 하는 일

ACK lifecycle은 서버가 명령을 발행한 사실과 장비가 실제로 수신·실행한 사실을 구분해 기록한다.

```text
PREPARED -> SENT -> ACKED -> EXECUTING -> COMPLETED
                    \-> FAILED
PREPARED -> FAILED (publish-failed)
SENT -> TIMED_OUT (ack-timeout)
```

## 2. 명령 발행 시퀀스

```text
Control Service
  -> MqttCommandPublisher.publish*Command()
  -> CommandExecutionService.register() (REQUIRES_NEW 등록 커밋)
  -> command_execution INSERT status=PREPARED
  -> ObjectMapper 직렬화
  -> MqttTransport.publish()
  -> CommandExecutionService.markSent() (아직 PREPARED인 경우만 SENT)
  -> STOMP control-events
```

Paho 연결·발행 완료 대기는 각각 최대 5초로 제한한다. timeout 이후에도 전송이 늦게 완료될 수 있으므로 미수신·물리 정지를 보장하지 않는다([Paho 토큰 문서](https://eclipse.dev/paho/files/javadoc/org/eclipse/paho/client/mqttv3/IMqttToken.html)).

추적 등록을 별도 트랜잭션으로 커밋한 뒤 발행하므로 전송 중 즉시 도착한 ACK도 조회할 수 있다. 직렬화·전송 예외는 `FAILED / publish-failed`로 기록하고 호출자에게 전파한다. 등록 실패 시 전송하지 않는다. 빠른 ACK가 이미 반영됐다면 후속 SENT 또는 발행 실패 처리가 이를 덮어쓰지 않는다. PREPARED 행의 sent_at은 등록 시각이며 SENT 전이 시 실제 발행 호출 종료 시각으로 갱신한다. 기존 NOT NULL 컬럼·마이그레이션은 변경하지 않는다.

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

`CommandExecutionService.markTimedOutCommands()`는 1초마다 실행된다. `sentAt`이 5초보다 오래됐고 상태가 `SENT`이면 `TIMED_OUT`으로 변경한다. ACK·timeout 갱신 조회에는 DB 행 쓰기 잠금을 사용한다.

`accepted` ACK는 수신 확인이며 완료가 아니다. ACKED·EXECUTING에는 완료 응답 기한을 임의로 적용하지 않는다. 완료 응답을 보내지 않는 현재 장비를 5초 뒤 실패로 단정하지 않는다. 완료 기한과 장비 watchdog 계약은 팀원 협의 항목이다.

## 5. 실제 검증에서 확인한 내용

- Edge Mock 명령은 처음 `ACKED`가 됐다.
- completed ACK가 없자 약 5초 후 `TIMED_OUT`으로 바뀌었다.
- 별도로 completed ACK를 발행한 명령은 `COMPLETED`가 됐고 6초 뒤에도 유지됐다.
- Jetson과 Edge Mock은 현재 주로 `accepted`만 발행한다.

## 6. 작업 8-3 보완과 남은 범위

- 저장된 명령의 robotId와 ACK robotId가 다르면 무시한다. MQTT topic과 payload 로봇 일치 검사는 기존 수신기에서 유지한다. 장비의 commandType 별칭 계약은 바꾸거나 강제하지 않는다.
- null·미지의 ACK status는 수신 성공으로 추정하지 않는다. 같은 상태, EXECUTING 이후 ACKED, 완료·실패·시간 초과 이후 응답은 무시한다. 종결 상태 이후 늦은 실제 성공도 자동 복구하지 않는 정책이다.
- STOMP의 `edge-ack`는 수신 확인, `executing`은 실행 중 응답, `completed`는 실제 완료 응답에만 사용한다. 웹은 MQTT 발행·장비 수신·실행 완료 응답을 별도 문구로 표시하며 중복·역순 이벤트로 같은 명령의 상태를 낮추지 않는다.
- 별도 등록 트랜잭션과 MQTT 발행은 하나의 분산 트랜잭션이 아니다. 등록 직후 프로세스가 종료되면 PREPARED가 남을 수 있으며 자동 재전송·outbox 복구는 이번 범위에서 구현하지 않았다. 전송 계층 예외가 장비 미수신을 증명하지는 않는다.
- idempotency key는 저장하지만 중복 명령 조회·재전송 중복 억제는 별도 범위다.
- 위 5절은 과거 검증 기록이다. 작업 8 통합 검증 결과는 개발 로그에 별도로 기록한다. 가짜 저장소 테스트는 실제 DB 행 잠금 경쟁의 실행 증거가 아니다.

## 7. ACK가 증명하는 범위

### 2026-10-06 PC 통합 검증

전용 서버 `127.0.0.1:18081`, 브로커 `127.0.0.1:18885`, PostgreSQL/PostGIS `127.0.0.1:55435`에서 HTTP → MQTT → 소프트웨어 ACK → 실제 DB → STOMP를 검사했다. 빠른 완료 ACK 12건이 COMPLETED로 남았으며 미지 상태·잘못된 로봇·알 수 없는 명령·중복·역순 응답이 상태를 되돌리지 않았다. accepted만 받은 명령은 6.2초 뒤에도 ACKED였고, ACK가 없는 SENT는 TIMED_OUT 및 timeout_at이 기록됐다. 시간 초과 뒤 늦은 완료는 종결 상태를 복구하지 않았다. 전용 브로커 중단 시 HTTP 500과 FAILED / publish-failed·failed_at도 확인했다.

`CommandExecutionConcurrencyTest` 2개는 실제 DB에서 ACK 트랜잭션의 행 잠금이 SENT 기록을 대기시키고 ACKED를 보존하는지, 동시에 도착한 accepted·completed가 COMPLETED를 유지하는지 확인한다. 실시간 발행기만 대역이며 DB 저장소·서비스 트랜잭션은 실제다. 브로커 경로 검사는 별도의 [Edge 검증 도구](../../tools/edge-mock-client/README.md#제어ack구역-저장-통합-검증)를 사용한다.

기본 제어 화면에서는 결과가 접힌 개발 상세에 숨는 문제가 발견됐다. 명령 상태와 API 오류를 상세 밖으로 옮겨 기본 화면에서 확인하고 보조 기술에 알리도록 했다. Mock 8종을 끈 브라우저에서 실제 STOMP의 수신 확인 → 실행 중 → 완료 응답을 확인했다. 390px 모바일 뷰포트에서도 줄바꿈·가로 넘침을 확인했다. 이 ACK는 PC 소프트웨어 응답이며 Jetson·STM32 완료 응답을 추가하거나 실기체 실행을 검증한 것이 아니다.

현재 `accepted`는 Jetson이 JSON을 검증하고 ROS 2 publish를 시도했다는 수준이다. STM32가 명령을 수신했거나 실제 PWM·릴레이 출력이 적용됐다는 뜻은 아니다. 실제 장비 완료 상태를 만들려면 STM32 ACK를 Jetson과 백엔드까지 전달해야 한다.

## 8. 권장 파일 읽기 순서

1. `backend/src/main/java/com/autonomousmower/mqtt/service/MqttCommandPublisher.java`
2. `backend/src/main/java/com/autonomousmower/control/service/CommandExecutionService.java`
3. `backend/src/main/java/com/autonomousmower/control/entity/CommandExecution.java`
4. `backend/src/main/java/com/autonomousmower/mqtt/service/MqttInboundSubscriber.java`
5. `edge/jetson-client/jetson_mower_client/command_ack.py`
6. `edge/jetson-client/jetson_mower_client/main.py`

## 작업 8 공통 제한

받은 하드웨어 코드와 MQTT·STM32 계약은 변경하지 않는다.
현재 장비가 보내지 않는 실행 완료 응답을 만들어내지 않는다.
계약 변경이 필요한 부분은 미구현으로 구분하고 팀원 협의 항목으로 남긴다.
2026-09-15 검증은 실제 명령 발행 없이 가짜 전송 계층을 사용했다. 2026-10-06에는 실장비와 분리된 전용 PC 브로커에만 명령을 발행했다.
