# 로컬 실행과 디버깅

이 문서는 공개용 예제이므로 실제 자격 증명은 환경변수 또는 Git에서 제외된 `.env`에 설정한다.

## 1. 인프라 실행

```powershell
docker compose up -d postgres mosquitto
docker compose ps
```

## 2. 백엔드 실행

```powershell
cd backend

$env:SPRING_DATASOURCE_URL="jdbc:postgresql://localhost:5432/mower"
$env:SPRING_DATASOURCE_USERNAME="<DB_USERNAME>"
$env:SPRING_DATASOURCE_PASSWORD="<DB_PASSWORD>"
$env:JWT_SECRET="<JWT_SECRET>"
$env:MQTT_ENABLED="true"
$env:MQTT_BROKER_URL="tcp://localhost:1883"

.\gradlew.bat bootRun
```

```powershell
Invoke-RestMethod http://localhost:8080/actuator/health
```

## 3. Edge Mock 실행

```powershell
cd tools\edge-mock-client
npm install

$env:MQTT_BROKER_URL="mqtt://localhost:1883"
$env:ROBOT_ID="<ROBOT_ID>"
npm start
```

## 4. 프론트엔드 실행

```powershell
cd frontend
npm install

$env:VITE_API_PROXY_TARGET="http://localhost:8080"
$env:VITE_ENABLE_MOCK_AUTH="false"
$env:VITE_ENABLE_MOCK_CONTROL="false"
$env:VITE_ENABLE_MOCK_ROBOTS="false"
$env:VITE_ENABLE_MOCK_REALTIME="false"
$env:VITE_WSS_URL="ws://localhost:8080/ws"

npm run dev
```

## 디버깅 순서

1. `docker compose ps`로 PostgreSQL과 Mosquitto 상태를 확인한다.
2. 백엔드 health endpoint를 확인한다.
3. Edge Mock에서 telemetry 발행 로그를 확인한다.
4. 백엔드에서 MQTT 수신과 DB 저장 로그를 확인한다.
5. 브라우저 개발자 도구에서 REST와 WebSocket 연결을 확인한다.
6. `command_execution` 테이블에서 명령 상태를 확인한다.

로그나 화면을 공유할 때 JWT, Authorization 헤더, 실제 계정, 외부 주소를 제거한다.
