# Edge Mock Client

백엔드 MQTT bridge를 로컬에서 확인하기 위한 Mock MQTT edge 클라이언트입니다. 실제 Jetson 또는 STM32 코드는 아닙니다.

## 제어·ACK·구역 저장 통합 검증

`npm run verify:control`은 실제 HTTP·MQTT·PostgreSQL·STOMP를 연결해 제어권 경쟁, 강제 회수 뒤 이전 버전 거부, ACK 전이와 구역 저장 충돌을 검사한다. 프론트 API Mock을 사용하는 검사가 아니며, 실행 완료 ACK의 원천은 PC 소프트웨어다. 하드웨어 실행 완료를 증명하지 않는다.

일반 `npm start`와 별도로 실행한다. 기존 장비가 연결되지 않은 전용 로컬 백엔드·브로커와 Docker DB가 필요하다. API 서버의 DB는 컨테이너 이름이 `mower-control-`로 시작하고 사용자 `mower_pc_test`, DB `mower_control_integration`인 전용 PostgreSQL/PostGIS를 가리켜야 한다. API·MQTT URL은 loopback만 허용한다. 서버와 검사 클라이언트의 브로커 주소가 같은지도 확인한다.

- 전체 마이그레이션을 적용하고 기존 관리자 등록 절차로 검증용 admin을 준비한다. ID·비밀번호를 저장소에 쓰지 않고 프로세스 환경으로 전달한다.
- 로봇 `CONTROL-TEST-01`, `CONTROL-TEST-02`를 전용 DB에 등록한다. 첫 로봇은 제어권이 없어야 하고 두 번째 로봇은 저장 구역이 없어야 한다. 기존 장비 ID로 대체하지 않는다.
- 아래 설정에서 관리자 ID·비밀번호는 실행 셸의 `CONTROL_TEST_ADMIN_ID`, `CONTROL_TEST_ADMIN_PASSWORD`에 별도로 주입한다. 실제 secret을 명령 기록·문서·로그에 붙여 넣지 않는다.

```powershell
$env:CONTROL_TEST_HTTP_URL = 'http://127.0.0.1:18081'
$env:CONTROL_TEST_MQTT_URL = 'mqtt://127.0.0.1:18885'
$env:CONTROL_TEST_DB_CONTAINER = 'mower-control-db-20261006'
npm run verify:control
```

검사는 매번 새로운 operator 2명·supervisor·read-only 계정을 만들고 비밀번호 변경 후 로그인한다. 동시 claim 성공 한 건/423 한 건, operator의 takeover 403, supervisor 회수 이후 소유권·버전 검사와 MQTT 미발행, 빠른 완료 ACK 12건, 잘못된 로봇·미지 상태·알 수 없는 명령·중복·역순 응답 무시, ACKED 유지와 SENT timeout, 데드맨 속도 0 정지, 비소유자의 긴급 정지, 안전 초기화 후 idle, 구역 최초 생성·수정 경쟁의 성공 한 건/409 한 건을 확인한다. 실제 DB 상태와 STOMP 이벤트를 함께 검사한다.

종료 시 검사 계정은 비활성화하고 제어권을 반납한다. 명령·감사·구역 결과는 증거로 남긴다. 재실행하려면 새로운 전용 DB와 위 초기 조건을 준비한다. 기존 업무 데이터를 삭제해 초기 조건을 만들지 않는다. 브로커 연결 실패 검증과 실제 DB 행 잠금·마이그레이션 순서 검증은 [개발 로그](../../docs/development-log.md)의 2026-10-06 기록과 [작업 구역 문서](../../docs/learning/07-work-zone-postgis.md)를 따른다.

## 기능

- 로컬 MQTT broker에 연결합니다.
- 아래 Mock edge 메시지를 publish합니다.
  - `mowers/{robotId}/telemetry` with QoS 1
  - `mowers/{robotId}/status` with QoS 1
  - `mowers/{robotId}/events` with QoS 1
- 백엔드 명령 topic을 구독합니다.
  - `mowers/{robotId}/commands/manual` with QoS 0
  - `mowers/{robotId}/commands/mode` with QoS 1
  - `mowers/{robotId}/commands/attachment` with QoS 1
  - `mowers/{robotId}/commands/stop` with QoS 1
  - `mowers/{robotId}/commands/estop` with QoS 1
- 명령 ack를 publish합니다.
  - `mowers/{robotId}/commands/ack` with QoS 1
- 수신한 명령은 stdout에 JSON 로그로 남깁니다.

## 로컬 Broker

Docker로 Mosquitto를 바로 띄울 수 있습니다.

```powershell
docker run --rm -it -p 1883:1883 eclipse-mosquitto:2 mosquitto -c /mosquitto-no-auth.conf
```

이미 `mqtt://localhost:1883`에서 접근 가능한 Mosquitto broker가 있다면 그대로 사용하면 됩니다.

## 설치 및 실행

```powershell
cd tools\edge-mock-client
npm install
npm start
```

기본값:

```text
MQTT_BROKER_URL=mqtt://localhost:1883
ROBOT_ID=MOWER-01
MQTT_CLIENT_ID=edge-mock-{ROBOT_ID}-{processId}
TELEMETRY_INTERVAL_MS=1000
STATUS_INTERVAL_MS=3000
EVENT_INTERVAL_MS=15000
```

값을 바꿔 실행하는 예:

```powershell
$env:MQTT_BROKER_URL="mqtt://localhost:1883"
$env:ROBOT_ID="MOWER-02"
npm start
```

username/password가 필요한 broker라면 다음처럼 지정합니다.

```powershell
$env:MQTT_USERNAME="mower"
$env:MQTT_PASSWORD="mower"
npm start
```

## 명령 전달 확인

Mosquitto CLI로 수동 명령을 publish합니다.

```powershell
mosquitto_pub -h localhost -t mowers/MOWER-01/commands/manual -q 0 -m "{\"commandId\":\"cmd-001\",\"robotId\":\"MOWER-01\",\"commandType\":\"manual-command\",\"parameters\":{\"direction\":\"forward\",\"speed\":0.5}}"
```

긴급 정지(E-Stop) 명령도 같은 방식으로 확인할 수 있습니다.

```powershell
mosquitto_pub -h localhost -t mowers/MOWER-01/commands/estop -q 1 -m "{\"commandId\":\"cmd-estop-001\",\"robotId\":\"MOWER-01\",\"commandType\":\"emergency-stop\",\"priority\":\"emergency\"}"
```

Mock client는 명령을 받으면 로그를 남기고 ack를 publish합니다. `stop`, `estop`, `mode` 명령을 받으면 내부 Mock 상태도 함께 갱신합니다.
