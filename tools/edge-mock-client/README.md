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

사설 CA를 사용하는 보안 브로커는 `MQTT_BROKER_URL=mqtts://...`와 `MQTT_CA_CERT_PATH=<CA_PEM_PATH>`를 함께 지정한다. CA 파일은 이 애플리케이션 연결에만 적용한다. TLS 1.2 이상과 인증서·호스트명 검증을 유지하며, CA 경로를 지정하고 `mqtt://`를 사용하면 연결 전에 실패한다. CA 경로가 없는 기존 평문 개발 실행은 그대로 사용할 수 있고, `mqtts://`에서 CA를 생략하면 Node의 기본 신뢰 저장소를 사용한다. 실제 비밀번호와 인증서 개인키는 Git에 넣지 않는다.

## 격리된 MQTT 보안 검증

`npm test`는 CA 옵션과 검증 도구의 입력 제한을 네트워크 없이 확인한다. `npm run verify:mqtt-security`는 별도로 준비한 TLS Mosquitto 브로커에서 MQTT 3.1.1 통신을 확인한다. Docker를 생성하거나 설정을 변경하지 않고 지정 컨테이너의 로그만 읽는다. 기존 `verify:control`과 별개이며 Java·Python 클라이언트, Jetson·STM32, 운영 배포의 검증을 대신하지 않는다.

먼저 [로드맵의 3-B-1](../../docs/learning/12-development-roadmap.md#3-b-1-보안-설정-준비와-격리된-pc-검증)에 따라 전용 브로커와 테스트 CA를 준비한다. 브로커는 `mqtts://localhost:18886` 또는 `mqtts://127.0.0.1:18886`만 허용하며 서버 인증서 SAN은 `localhost`로 준비한다. 정상 통신은 SAN에 맞는 `localhost`로 실행한다. `127.0.0.1` 연결은 호스트명 불일치 거부 검증에 사용한다. 컨테이너 이름은 `mower-mqtt-security-`로 시작해야 하고, 로봇은 `SECURITY-TEST-01`, `SECURITY-TEST-02`만 사용한다. 상세 broker 로그에 client ID·토픽이 포함된 거부 기록이 필요하다.

Git 제외 경로 `.local-docs/mqtt-security/<RUN_ID>/credentials.json`에 다음 필드를 준비한다. 비밀번호·전체 설정 JSON을 stdout에 출력하지 않는다.

| 필드 | 값 |
|---|---|
| `brokerUrl` | `mqtts://localhost:18886` |
| `caCertPath`, `wrongCaCertPath` | 정상 CA와 다른 테스트 CA의 PEM 절대 경로 |
| `containerName` | 전용 Mosquitto 컨테이너 이름 |
| `robotIds` | `["SECURITY-TEST-01", "SECURITY-TEST-02"]` |
| `accounts.backend`, `accounts.edge1`, `accounts.edge2`, `accounts.observer` | 각각 `username`, `password`를 가진 객체 |

observer는 `mowers/#` 읽기만 허용하고 쓰기는 차단한다. backend는 각 로봇의 다섯 명령만 쓰고 telemetry·status·events·ACK만 읽는다. 각 edge는 자기 로봇의 다섯 명령만 읽고 자기 telemetry·status·events·ACK만 쓴다.

```powershell
$env:MQTT_SECURITY_CONFIG = '<ABSOLUTE_PATH_TO_CREDENTIALS_JSON>'
npm run verify:mqtt-security
```

설정이 없거나 주소·로봇·컨테이너 조건이 다르면 네트워크 호출 전에 실패한다. 정상 계정 네 개 접속과 익명·잘못된 비밀번호·잘못된 CA·호스트명 불일치 거부를 검사한다. 각 로봇의 backend→edge 다섯 명령은 수동 QoS 0, 나머지 QoS 1로, edge→backend 네 토픽은 QoS 1로 실제 수신을 확인한다.

다른 로봇 명령 전달·상태 발행, edge의 명령 발행, backend의 telemetry·ACK 발행과 observer 쓰기는 차단해야 한다. 발행 거부 검사는 같은 연결의 정상 통신을 앞뒤로 확인하고, 고유 marker 미수신과 해당 client ID·토픽의 `Denied PUBLISH` 브로커 로그를 함께 요구한다.

Mosquitto `acl_file`의 읽기 ACL은 MQTT 3.1.1 SUBACK 이후 실제 전달 시점에 적용될 수 있다. 이 경우 `Denied SUBSCRIBE`가 없어도 다른 로봇 명령은 전달되지 않는다. 검증 도구는 이를 **구독 요청 거부가 아닌 명령 전달 차단**으로 보고한다. 해당 연결의 정상 명령 전후 수신, 정상 로봇과 observer의 같은 marker 수신, 비인가 연결의 미수신, 브로커 구독 감사 로그와 비인가 연결로의 송신 로그 부재를 함께 확인한다. 명시적인 SUBACK 거부 로그는 확보하지 못한 것으로 출력한다. MQTT 3.1.1의 발행 callback이나 구독 grant만으로 허용을 판정하지 않는다. 어떤 검사든 실패하면 종료 코드는 1이며 실제 통과한 항목만 `PASS`로 출력한다.

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
