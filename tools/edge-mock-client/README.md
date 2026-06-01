# Edge Mock Client

백엔드 MQTT bridge를 로컬에서 확인하기 위한 Mock MQTT edge 클라이언트입니다. 실제 Jetson 또는 STM32 코드는 아닙니다.

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
