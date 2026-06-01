# 자율주행 예초기

자율주행 예초기 관제 시스템의 로컬 개발 환경입니다. 인프라는 Docker Compose로 띄우고, Spring Boot 백엔드, React 프론트엔드, Edge Mock은 각각 로컬 프로세스로 실행합니다.

## 준비물

- Docker Desktop
- Java 21
- Node.js 20+
- PowerShell

## 환경 파일

로컬 설정을 따로 관리하려면 `.env.example`을 `.env`로 복사해서 사용하면 됩니다.

기본 통합 테스트용 로봇:

- Robot ID: `MOWER-01`

Flyway migration `V4__seed_local_integration_data.sql`에는 로봇 seed 데이터만 들어 있습니다. 로컬 관리자 계정은 커밋된 migration에 넣지 말고 별도 절차로 준비합니다.

## 1. Docker 의존성 실행

PostgreSQL/PostGIS와 Mosquitto를 먼저 띄웁니다.

```powershell
docker compose up -d postgres mosquitto
docker compose ps
```

필요할 때 로그는 이렇게 확인합니다.

```powershell
docker compose logs -f mosquitto
docker compose logs -f postgres
```

Mosquitto는 `localhost:1883`에서 동작합니다. 백엔드는 기본적으로 `tcp://localhost:1883`에 연결하고, Node MQTT 클라이언트는 `mqtt://localhost:1883`을 사용합니다.

## 2. 백엔드 실행

새 PowerShell 터미널에서 실행합니다.

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

MQTT 명령 publish 로그는 `MqttCommandPublisher`에서 확인할 수 있습니다.

## 3. Edge Mock 실행

새 PowerShell 터미널에서 실행합니다.

```powershell
cd tools\edge-mock-client

npm install
$env:MQTT_BROKER_URL="mqtt://localhost:1883"
$env:ROBOT_ID="MOWER-01"
npm start
```

Edge Mock은 아래 topic을 구독합니다.

- `mowers/MOWER-01/commands/manual`
- `mowers/MOWER-01/commands/stop`
- `mowers/MOWER-01/commands/estop`

MQTT 명령을 받으면 JSON 로그로 출력합니다.

## 4. 프론트엔드 실행

새 PowerShell 터미널에서 실행합니다.

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

브라우저에서 다음 주소로 접속합니다.

```text
http://localhost:5173/login
```

로컬 관리자 계정으로 로그인한 뒤 지도 보기의 제어 패널에서 흐름을 확인하면 됩니다.

## 통합 Smoke Flow

UI로 확인하거나 프론트엔드 개발 서버 proxy를 통해 직접 호출할 수 있습니다.

```powershell
$base="http://localhost:5173"
$login = Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType "application/json" -Body (@{adminId=$env:LOCAL_ADMIN_ID; password=$env:LOCAL_ADMIN_PASSWORD} | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.data.accessToken)" }

Invoke-RestMethod -Method Post -Uri "$base/api/control/MOWER-01/claim" -Headers $headers -ContentType "application/json" -Body (@{idempotencyKey="smoke-claim"; requestedMode="manual"} | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$base/api/control/MOWER-01/manual" -Headers $headers -ContentType "application/json" -Body (@{action="manual"; robotId="MOWER-01"; direction="forward"; speed=0.6; idempotencyKey="smoke-manual"; lockVersion=0; clientSentAt=(Get-Date).ToUniversalTime().ToString("o")} | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$base/api/control/MOWER-01/stop" -Headers $headers -ContentType "application/json" -Body (@{action="stop"; robotId="MOWER-01"; direction="stop"; speed=0; idempotencyKey="smoke-stop"; lockVersion=0; reason="smoke-test"} | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$base/api/control/MOWER-01/estop" -Headers $headers -ContentType "application/json" -Body (@{idempotencyKey="smoke-estop"; reason="smoke-test"} | ConvertTo-Json)
```

정상 동작 시 확인할 수 있는 내용:

- 백엔드 로그에 manual, stop, 긴급 정지(E-Stop) MQTT publish가 남습니다.
- Edge Mock 로그에 manual, stop, 긴급 정지(E-Stop) `command-received`가 남습니다.
- Mosquitto 로그에서 백엔드와 Edge Mock 클라이언트 연결을 확인할 수 있습니다.

## 종료

백엔드, 프론트엔드, Edge Mock은 각 터미널에서 `Ctrl+C`로 종료합니다.

Docker 의존성은 다음 명령으로 내립니다.

```powershell
docker compose down
```

의존성 volume까지 함께 지울 때만 아래 명령을 사용합니다.

```powershell
docker compose down -v
```
