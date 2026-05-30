# Edge Mock Client

Mock MQTT edge client for backend MQTT bridge testing. This is not Jetson or STM32 code.

## Features

- Connects to a local MQTT broker.
- Publishes mock edge messages:
  - `mowers/{robotId}/telemetry` with QoS 1
  - `mowers/{robotId}/status` with QoS 1
  - `mowers/{robotId}/events` with QoS 1
- Subscribes to backend command topics:
  - `mowers/{robotId}/commands/manual` with QoS 0
  - `mowers/{robotId}/commands/stop` with QoS 1
  - `mowers/{robotId}/commands/estop` with QoS 1
- Prints received commands to stdout as JSON logs.

## Start A Local Broker

Using Docker:

```powershell
docker run --rm -it -p 1883:1883 eclipse-mosquitto:2 mosquitto -c /mosquitto-no-auth.conf
```

Or use any local Mosquitto broker reachable at `mqtt://localhost:1883`.

## Install And Run

```powershell
cd tools\edge-mock-client
npm install
npm start
```

Default settings:

```text
MQTT_BROKER_URL=mqtt://localhost:1883
ROBOT_ID=MOWER-01
MQTT_CLIENT_ID=edge-mock-{ROBOT_ID}-{processId}
TELEMETRY_INTERVAL_MS=1000
STATUS_INTERVAL_MS=3000
EVENT_INTERVAL_MS=15000
```

Example with overrides:

```powershell
$env:MQTT_BROKER_URL="mqtt://localhost:1883"
$env:ROBOT_ID="MOWER-02"
npm start
```

With username/password:

```powershell
$env:MQTT_USERNAME="mower"
$env:MQTT_PASSWORD="mower"
npm start
```

## Test Command Delivery

Publish a manual command with Mosquitto CLI:

```powershell
mosquitto_pub -h localhost -t mowers/MOWER-01/commands/manual -q 0 -m "{\"commandId\":\"cmd-001\",\"robotId\":\"MOWER-01\",\"commandType\":\"manual-command\",\"parameters\":{\"direction\":\"forward\",\"speed\":0.5}}"
```

Publish an E-Stop command:

```powershell
mosquitto_pub -h localhost -t mowers/MOWER-01/commands/estop -q 1 -m "{\"commandId\":\"cmd-estop-001\",\"robotId\":\"MOWER-01\",\"commandType\":\"emergency-stop\",\"priority\":\"emergency\"}"
```

The mock client logs each received command and changes its mock status after `stop` or `estop`.
