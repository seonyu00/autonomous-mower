# 자율주행 예초기

로컬 개발 환경은 Docker Compose로 인프라를 띄우고, Spring Boot 백엔드, React 프론트엔드, Edge Mock을 각각 로컬 프로세스로 실행합니다.

## 사전 준비

- Docker Desktop
- Java 21
- Node.js 20+
- PowerShell

## 환경 설정

로컬에서 수정 가능한 환경 파일이 필요하면 `.env.example`을 `.env`로 복사하세요.

기본 로컬 통합 로봇:

- Robot ID: `MOWER-01`

Flyway migration `V4__seed_local_integration_data.sql`은 로봇 전용 로컬 seed 데이터만 설치합니다. 로컬 관리자 계정 정보는 커밋된 migration이 아닌 별도 절차로 준비하세요.

## 1. Docker 의존성 시작

PostgreSQL/PostGIS와 Mosquitto를 시작합니다.

```powershell
docker compose up -d postgres mosquitto
docker compose ps
```

유용한 확인 명령:

```powershell
docker compose logs -f mosquitto
docker compose logs -f postgres
```

Mosquitto는 `localhost:1883`에서 대기합니다. 백엔드 기본 통합 URL은 `tcp://localhost:1883`이고, Node MQTT 클라이언트는 `mqtt://localhost:1883`을 사용합니다.

## 2. 백엔드 시작

새 PowerShell 터미널을 엽니다.

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

백엔드 MQTT 명령 publish 로그는 `MqttCommandPublisher`에서 출력됩니다.

## 3. Edge Mock 시작

새 PowerShell 터미널을 엽니다.

```powershell
cd tools\edge-mock-client

npm install
$env:MQTT_BROKER_URL="mqtt://localhost:1883"
$env:ROBOT_ID="MOWER-01"
npm start
```

Edge Mock은 다음 topic을 구독합니다.

- `mowers/MOWER-01/commands/manual`
- `mowers/MOWER-01/commands/stop`
- `mowers/MOWER-01/commands/estop`

수신한 MQTT 명령은 JSON 로그로 출력됩니다.

## 4. 프론트엔드 시작

새 PowerShell 터미널을 엽니다.

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

브라우저에서 엽니다.

```text
http://localhost:5173/login
```

로컬에 준비한 관리자 계정으로 로그인한 뒤 지도 보기의 제어 패널을 사용하세요.

## 통합 Smoke Flow

UI를 사용하거나 프론트엔드 개발 서버 proxy를 통해 호출합니다.

```powershell
$base="http://localhost:5173"
$login = Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType "application/json" -Body (@{adminId=$env:LOCAL_ADMIN_ID; password=$env:LOCAL_ADMIN_PASSWORD} | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.data.accessToken)" }

Invoke-RestMethod -Method Post -Uri "$base/api/control/MOWER-01/claim" -Headers $headers -ContentType "application/json" -Body (@{idempotencyKey="smoke-claim"; requestedMode="manual"} | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$base/api/control/MOWER-01/manual" -Headers $headers -ContentType "application/json" -Body (@{action="manual"; robotId="MOWER-01"; direction="forward"; speed=0.6; idempotencyKey="smoke-manual"; lockVersion=0; clientSentAt=(Get-Date).ToUniversalTime().ToString("o")} | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$base/api/control/MOWER-01/stop" -Headers $headers -ContentType "application/json" -Body (@{action="stop"; robotId="MOWER-01"; direction="stop"; speed=0; idempotencyKey="smoke-stop"; lockVersion=0; reason="smoke-test"} | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$base/api/control/MOWER-01/estop" -Headers $headers -ContentType "application/json" -Body (@{idempotencyKey="smoke-estop"; reason="smoke-test"} | ConvertTo-Json)
```

예상 관찰 결과:

- 백엔드 로그에 manual, stop, 긴급 정지(E-Stop) MQTT publish가 표시됩니다.
- Edge Mock 로그에 manual, stop, 긴급 정지(E-Stop)에 대한 `command-received`가 표시됩니다.
- Mosquitto 로그에 백엔드와 Edge Mock 클라이언트 연결이 표시됩니다.

## 종료

각 터미널에서 `Ctrl+C`로 로컬 백엔드, 프론트엔드, Edge Mock을 중지합니다.

Docker 의존성을 중지합니다.

```powershell
docker compose down
```

의존성 volume까지 제거하려면 다음을 실행합니다.

```powershell
docker compose down -v
```
