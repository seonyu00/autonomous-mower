# Autonomous Mower

Local development uses Docker Compose for infrastructure and runs the Spring Boot backend, React frontend, and Edge Mock as local processes.

## Prerequisites

- Docker Desktop
- Java 21
- Node.js 20+
- PowerShell

## Environment

Copy `.env.example` to `.env` if you want a local editable environment file.

Default local integration robot:

- Robot ID: `MOWER-01`

Flyway migration `V4__seed_local_integration_data.sql` installs robot-only local seed data. Provision local admin credentials outside committed migrations.

## 1. Start Docker Dependencies

Start PostgreSQL/PostGIS and Mosquitto:

```powershell
docker compose up -d postgres mosquitto
docker compose ps
```

Useful checks:

```powershell
docker compose logs -f mosquitto
docker compose logs -f postgres
```

Mosquitto listens on `localhost:1883`. The backend default integration URL is `tcp://localhost:1883`; Node MQTT clients use `mqtt://localhost:1883`.

## 2. Start Backend

Open a new PowerShell terminal:

```powershell
cd backend

$env:SERVER_PORT="8080"
$env:SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5432/mower"
$env:SPRING_DATASOURCE_USERNAME="mower"
$env:SPRING_DATASOURCE_PASSWORD="mower"
$env:JWT_SECRET="change-me-to-a-32-byte-minimum-secret"
$env:MQTT_ENABLED="true"
$env:MQTT_BROKER_URL="tcp://localhost:1883"

.\gradlew.bat bootRun
```

Health check:

```powershell
Invoke-RestMethod http://localhost:8080/actuator/health
```

Backend MQTT command publish logs are emitted by `MqttCommandPublisher`.

## 3. Start Edge Mock

Open a new PowerShell terminal:

```powershell
cd tools\edge-mock-client

npm install
$env:MQTT_BROKER_URL="mqtt://localhost:1883"
$env:ROBOT_ID="MOWER-01"
npm start
```

The Edge Mock subscribes to:

- `mowers/MOWER-01/commands/manual`
- `mowers/MOWER-01/commands/stop`
- `mowers/MOWER-01/commands/estop`

It prints received MQTT commands as JSON logs.

## 4. Start Frontend

Open a new PowerShell terminal:

```powershell
cd frontend

npm install
$env:VITE_API_PROXY_TARGET="http://localhost:8080"
$env:VITE_ENABLE_MOCK_AUTH="false"
$env:VITE_ENABLE_MOCK_CONTROL="false"
$env:VITE_ENABLE_MOCK_ROBOTS="false"
$env:VITE_ENABLE_MOCK_REALTIME="true"

npm run dev
```

Open:

```text
http://localhost:5173/login
```

Login with your locally provisioned admin account, then use the Map View control panel.

## Integration Smoke Flow

Use the UI or call through the frontend dev server proxy:

```powershell
$base="http://localhost:5173"
$login = Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType "application/json" -Body (@{adminId=$env:LOCAL_ADMIN_ID; password=$env:LOCAL_ADMIN_PASSWORD} | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.data.accessToken)" }

Invoke-RestMethod -Method Post -Uri "$base/api/control/MOWER-01/claim" -Headers $headers -ContentType "application/json" -Body (@{idempotencyKey="smoke-claim"; requestedMode="manual"} | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$base/api/control/MOWER-01/manual" -Headers $headers -ContentType "application/json" -Body (@{action="manual"; robotId="MOWER-01"; direction="forward"; speed=0.6; idempotencyKey="smoke-manual"; lockVersion=0; clientSentAt=(Get-Date).ToUniversalTime().ToString("o")} | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$base/api/control/MOWER-01/stop" -Headers $headers -ContentType "application/json" -Body (@{action="stop"; robotId="MOWER-01"; direction="stop"; speed=0; idempotencyKey="smoke-stop"; lockVersion=0; reason="smoke-test"} | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$base/api/control/MOWER-01/estop" -Headers $headers -ContentType "application/json" -Body (@{idempotencyKey="smoke-estop"; reason="smoke-test"} | ConvertTo-Json)
```

Expected observations:

- Backend logs show MQTT publish for manual, stop, and E-Stop.
- Edge Mock logs show `command-received` for manual, stop, and E-Stop.
- Mosquitto logs show backend and Edge Mock client connections.

## Shutdown

Stop local backend/frontend/edge mock with `Ctrl+C` in each terminal.

Stop Docker dependencies:

```powershell
docker compose down
```

To also remove dependency volumes:

```powershell
docker compose down -v
```
