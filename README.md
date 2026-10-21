# 자율주행 예초기

자율주행 예초기 관제 시스템의 로컬 개발 환경입니다. 인프라는 Docker Compose로 띄우고, Spring Boot 백엔드, React 프론트엔드, Edge Mock은 각각 로컬 프로세스로 실행합니다.

프로젝트 구조와 기능별 코드 흐름은 [`docs/learning/README.md`](docs/learning/README.md)에서 순서대로 학습할 수 있습니다. 문서의 `<...>` 값은 실제 로컬 환경값으로 교체해야 하는 placeholder입니다.

## 준비물

- Docker Desktop
- Java 21
- Node.js 20+
- PowerShell

## 환경 파일

로컬 설정을 따로 관리하려면 `.env.example`을 `.env`로 복사해서 사용하면 됩니다.

기본 통합 테스트용 로봇:

- Robot ID: `<ROBOT_ID>`

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
$env:SPRING_DATASOURCE_USERNAME="<DB_USERNAME>"
$env:SPRING_DATASOURCE_PASSWORD="<DB_PASSWORD>"
$env:JWT_SECRET="<JWT_SECRET>"
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
$env:ROBOT_ID="<ROBOT_ID>"
npm start
```

Edge Mock은 아래 topic을 구독합니다.

- `mowers/<ROBOT_ID>/commands/manual`
- `mowers/<ROBOT_ID>/commands/stop`
- `mowers/<ROBOT_ID>/commands/estop`

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

## Vercel 프론트와 PC 백엔드의 접속 설정

REST API와 `/ws`는 `APP_ALLOWED_ORIGINS`의 허용 목록을 공유한다. 기본값은 `http://localhost:5173,http://127.0.0.1:5173`이다. 다른 로컬 포트나 실제 Vercel 주소를 사용하면 해당 Origin을 목록에 추가한다. Origin은 `https://` 또는 `http://`로 시작하며 경로·끝 슬래시·와일드카드를 포함하지 않아야 한다. 브라우저가 생략하는 기본 포트(HTTP의 `:80`, HTTPS의 `:443`)도 생략한다. 빈 포트와 65535를 넘는 포트를 포함한 잘못된 목록은 백엔드 시작 시 거부한다.

백엔드 실행 PowerShell에서 설정하는 예시는 다음과 같다. `<FRONTEND_ORIGIN>`을 실제 프론트의 `https://...` Origin으로 교체한 뒤 사용한다. 주소가 아직 없으면 로컬 기본값을 유지한다.

```powershell
$env:APP_ALLOWED_ORIGINS='http://localhost:5173,http://127.0.0.1:5173,<FRONTEND_ORIGIN>'
```

이 목록에는 웹 화면의 주소를 넣는다. API·WSS의 연결 대상 주소는 프론트 빌드 환경에 별도로 지정한다.

```dotenv
VITE_API_BASE_URL=https://<BACKEND_HOST>
VITE_WSS_URL=wss://<BACKEND_HOST>/ws
```

- API 주소 끝에 `/api`를 붙이지 않는다. 현재 HTTP 클라이언트의 요청 경로에 이미 포함돼 있다.
- 백엔드 환경변수는 실행 프로세스에 주입한다. 루트 `.env`를 작성하는 것만으로 `bootRun`에 자동 전달되지는 않는다.
- `VITE_*`는 빌드에 포함되므로 변경 후 재배포가 필요하다. JWT secret·DB/MQTT 비밀번호는 넣지 않는다.
- Vercel은 Framework Preset `Vite`, Root Directory `frontend`, Build Command `npm run build`, Output Directory `dist`로 준비한다. `frontend/vercel.json`은 `/login`, `/map`의 직접 접속·새로고침을 처리한다.
- 네이버 지도 콘솔에도 실제 프론트 Origin을 등록한다. 외부 접속 검증에서는 모든 `VITE_ENABLE_MOCK_*`를 `false`로 둔다.
- CORS 허용과 별도로 REST JWT·역할 권한 및 STOMP CONNECT·SUBSCRIBE 검사가 적용된다. CORS는 비브라우저 클라이언트에 대한 접근 제어나 사용자 인증을 대체하지 않는다.

Compose의 PostgreSQL 호스트 포트는 `127.0.0.1`에 바인딩한다. 백엔드는 같은 PC의 로컬 포트로 접속하고 다른 기기의 직접 DB 접속은 제한한다. 이 설정은 컨테이너 재생성 시 적용되므로 파일 수정만으로 실행 중인 DB의 바인딩이 바뀌지는 않는다. 기존 데이터 볼륨을 유지하며 적용 전 별도 확인이 필요하다.

2026-10-19의 3-A에서는 웹 접속 코드·설정을 준비했고, 3-B-1에서는 아래 격리 브로커로 MQTT 인증·ACL·TLS를 검증했다. 기존 시연 서비스의 보안 전환·Funnel 공개·외부 브라우저 검증은 후속 적용 대상이다. 상세 결과는 [개발 로그](docs/development-log.md)의 같은 날짜 항목을 참고한다.

## MQTT 인증·ACL·TLS의 격리 검증

`docker-compose.mqtt-security.yml`은 기존 개발 Compose와 별도 프로젝트로 동작한다. 호스트의 `127.0.0.1:18886`에서만 TLS를 받고 익명 접속을 거부한다. 기존 `1883` 브로커·DB·실제 로봇에는 연결하지 않는다. 이 구성은 테스트 전용이며 기존 개발 브로커의 익명 접속 설정을 바꾸지 않는다. 기존 개발 구성을 그대로 외부에 공개하면 안 된다.

PowerShell 7, Docker Desktop, Java 21, OpenSSL과 Node·Python 의존성이 필요하다. 저장소 루트에서 다음과 같이 준비한다. OpenSSL 위치가 다르면 `prepare.ps1 -OpenSslPath '<OPENSSL_PATH>'`로 지정한다.

```powershell
$configPath = & ./tools/mqtt-security/prepare.ps1
$testConfig = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$env:MQTT_SECURITY_CONFIG = $configPath
$env:MQTT_SECURITY_DIR = Split-Path $configPath
$env:MQTT_SECURITY_CONTAINER = $testConfig.containerName
docker compose -f docker-compose.mqtt-security.yml up -d
```

스크립트는 `.local-docs/mqtt-security/<실행 ID>/`에 무작위 비밀번호, 해시 파일, CA·서버 인증서와 개인키를 만든다. 해당 폴더는 Git 제외 여부를 검사하고 Windows에서 현재 사용자와 SYSTEM만 접근하도록 설정한다. 비밀번호를 명령행 인자로 넘기거나 화면에 출력하지 않는다. Windows bind mount의 Linux 권한 경고를 피하도록 브로커는 필요한 파일만 컨테이너 tmpfs에 복사해 소유자와 권한을 제한한다.

인증서는 2일짜리 테스트용이며 서버 SAN은 `localhost`뿐이다. 테스트 클라이언트는 `localhost`로 연결하고 `127.0.0.1`은 호스트명 불일치 거부 검사에만 쓴다. 만료되면 준비 스크립트로 다시 생성한다. 운영 호스트 인증서와 실제 로봇 계정은 별도로 준비해야 한다.

ACL은 다음 방향만 허용한다. `commands/#` 전체의 쓰기를 허용하면 ACK까지 위조할 수 있으므로 명령 5개를 개별 지정한다.

| 계정 | 읽기 | 쓰기 |
|---|---|---|
| 테스트 백엔드 | 두 테스트 로봇의 telemetry·status·events·commands/ack | 두 로봇의 manual·stop·estop·mode·attachment 명령 |
| 테스트 Edge 1·2 | 자기 로봇의 명령 5개 | 자기 telemetry·status·events·commands/ack |
| 테스트 observer | 테스트 브로커의 `mowers/#` | 없음 |

준비한 같은 PowerShell에서 각 검사를 실행한다. Python 전용 가상환경은 최초 한 번 생성한다. `MQTT_SECURITY_CONFIG`가 없으면 Java·Python의 실브로커 검사는 skip되고 Node 보안 검사는 실행을 거부한다.

```powershell
npm --prefix tools/edge-mock-client test
npm --prefix tools/edge-mock-client run verify:mqtt-security

Push-Location backend
./gradlew.bat test --tests 'com.autonomousmower.config.MqttTls*Test'
Pop-Location

python -m venv .local-docs/mqtt-security-venv
& ./.local-docs/mqtt-security-venv/Scripts/python.exe -m pip install -r edge/jetson-client/requirements.txt
Push-Location edge/jetson-client
& ../../.local-docs/mqtt-security-venv/Scripts/python.exe -m unittest discover -s tests -v
Pop-Location
```

Node 검사는 인증·TLS 거부와 토픽/QoS·ACL을, Java는 실제 백엔드 연결 옵션과 전송 계층의 명령·ACK 왕복을, Python은 실제 `MqttEdgeClient`의 CA·호스트명 검증을 확인한다. Mosquitto의 읽기 ACL은 SUBACK 뒤 메시지 전달 시점에 적용될 수 있다. 다른 로봇 접근 차단은 동일 연결의 전후 정상 통신, 고유 메시지의 미수신, 정상 수신자의 수신과 브로커 감사 로그로 확인하며 SUBACK 거부로 표현하지 않는다. 발행 차단은 `Denied PUBLISH` 로그도 확인한다. MQTT 3.1.1의 발행 성공 응답만으로 권한을 판정하지 않는다.

검사 후 전용 서비스만 종료한다. 다른 Compose 파일이나 `--remove-orphans`, `down -v`를 사용하지 않는다. 생성한 비밀 파일은 Git 제외 폴더에 남는다.

```powershell
docker compose -f docker-compose.mqtt-security.yml down
Remove-Item Env:MQTT_SECURITY_CONFIG, Env:MQTT_SECURITY_DIR, Env:MQTT_SECURITY_CONTAINER
```

클라이언트의 선택적 CA 설정은 다음과 같다. CA를 지정하고 평문 URL을 사용하면 실패하며, 잘못되거나 읽을 수 없는 CA를 기본 신뢰로 우회하지 않는다. TLS에서는 인증서·호스트명을 검증하고 TLS 1.2 이상을 사용한다. CA를 생략한 TLS 연결은 시스템 신뢰 저장소를 사용하고, 기존 평문 로컬 개발 기본값은 유지한다.

| 클라이언트 | TLS URL | CA 파일 설정 |
|---|---|---|
| Java 백엔드 | `MQTT_BROKER_URL=ssl://<BROKER_HOST>:8883` | `MQTT_CA_CERT_PATH=<ABSOLUTE_CA_PEM_PATH>` |
| Node Edge Mock | `MQTT_BROKER_URL=mqtts://<BROKER_HOST>:8883` | `MQTT_CA_CERT_PATH=<ABSOLUTE_CA_PEM_PATH>` |
| Python Jetson | YAML `mqtt.broker_url: mqtts://<BROKER_HOST>:8883` | YAML `mqtt.ca_cert_path: <ABSOLUTE_CA_PEM_PATH>` |

이 검사는 PC의 소프트웨어 통신 검증이다. REST→DB→STOMP 전체 흐름, 팀원 장비의 실제 설정, Jetson·STM32·물리 동작, 시연 브로커 전환과 외부 통신 암호화를 검증한 결과는 아니다. `verify:control`의 익명 loopback 전제를 풀어 운영 브로커에 사용하지 않는다.

## 통합 Smoke Flow

UI로 확인하거나 프론트엔드 개발 서버 proxy를 통해 직접 호출할 수 있습니다.

```powershell
$base="http://localhost:5173"
$login = Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType "application/json" -Body (@{adminId=$env:LOCAL_ADMIN_ID; password=$env:LOCAL_ADMIN_PASSWORD} | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.data.accessToken)" }

Invoke-RestMethod -Method Post -Uri "$base/api/control/<ROBOT_ID>/claim" -Headers $headers -ContentType "application/json" -Body (@{idempotencyKey="smoke-claim"; requestedMode="manual"} | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$base/api/control/<ROBOT_ID>/manual" -Headers $headers -ContentType "application/json" -Body (@{action="manual"; robotId="<ROBOT_ID>"; direction="forward"; speed=0.6; idempotencyKey="smoke-manual"; lockVersion=0; clientSentAt=(Get-Date).ToUniversalTime().ToString("o")} | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$base/api/control/<ROBOT_ID>/stop" -Headers $headers -ContentType "application/json" -Body (@{action="stop"; robotId="<ROBOT_ID>"; direction="stop"; speed=0; idempotencyKey="smoke-stop"; lockVersion=0; reason="smoke-test"} | ConvertTo-Json)
Invoke-RestMethod -Method Post -Uri "$base/api/control/<ROBOT_ID>/estop" -Headers $headers -ContentType "application/json" -Body (@{idempotencyKey="smoke-estop"; reason="smoke-test"} | ConvertTo-Json)
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
