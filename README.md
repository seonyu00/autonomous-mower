# 자율주행 예초기

자율주행 예초기 관제 시스템의 로컬 개발 환경입니다. 인프라는 Docker Compose로 띄우고, Spring Boot 백엔드, React 프론트엔드, Edge Mock은 각각 로컬 프로세스로 실행합니다.

프로젝트 구조와 기능별 코드 흐름은 [`docs/learning/README.md`](docs/learning/README.md)에서 순서대로 학습할 수 있습니다. 문서의 `<...>` 값은 실제 로컬 환경값으로 교체해야 하는 placeholder입니다.

PC 시연용 보안 설정을 적용한 환경은 아래 [PC 시연 환경 재실행](#pc-시연-환경-재실행)을 따른다. `docker compose up`만 실행하는 기존 절차는 평문·익명 접속을 사용하는 로컬 개발용이다.

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

실제 로그인은 허용 목록에 등록한 고정 Production 도메인으로 접속한다. Vercel의 개별 배포에서 생성되는 긴 주소는 같은 프로젝트라도 별도 Origin이다. 고정 도메인만 허용한 상태에서 개별 배포 주소를 열면 계정 정보가 맞아도 CORS 사전 요청이 거부돼 `Failed to fetch`가 표시될 수 있다. 이때 허용 범위를 넓히기 전에 브라우저 주소가 등록된 고정 도메인인지 확인한다.

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

2026-10-19의 3-A에서는 위 코드·설정을 준비했고, 3-B-1에서는 아래 격리 브로커로 MQTT 보안을 검증했다. 2026-10-20에는 PC 서비스 보안 설정과 Funnel 공개를 적용하고 공개 중계 서버를 거친 HTTPS·WSS 검사를 통과했다. 2026-10-21에는 Vercel 빌드의 환경변수 반영과 PC Chrome의 고정 도메인 로그인·지도 표시를 확인했다. Tailscale을 사용하지 않는 외부 기기의 브라우저·실제 Jetson·WebRTC 검증은 남아 있다. 상세 결과는 [개발 로그](docs/development-log.md)의 해당 날짜 항목을 참고한다.

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

## PC 시연 환경 재실행

3-B-2의 PC 적용은 기존 PostgreSQL 볼륨을 유지하고 DB·API·MQTT를 PC 내부에만 연다. 기존 개발 설정에 `docker-compose.pc-demo.yml`을 함께 적용하며, 포트 목록을 `!override`로 교체하므로 Compose 2.24.4 이상이 필요하다.

| 서비스 | PC 접속 주소 | 적용 범위 |
|---|---|---|
| PostgreSQL | `127.0.0.1:5432` | 기존 DB·계정·데이터 유지 |
| MQTT | `ssl://localhost:18883`(Java), `mqtts://localhost:18883`(Node·Python) | TLS 1.2 이상, 백엔드 전용 계정, 상태·ACK 쓰기 금지 |
| 백엔드 | `http://127.0.0.1:8080`, `ws://127.0.0.1:8080/ws` | 배포 프론트 Origin 허용, JWT·STOMP 권한 유지 |

Docker Desktop을 실행한 뒤 저장소 루트의 Windows PowerShell 5.1 또는 PowerShell 7에서 다음을 실행한다. Java 21과 사전에 준비된 `.local-docs/pc-demo/runtime.json`이 필요하다. 이 JSON에는 실제 접속 비밀값이 있으므로 Git이나 채팅에 공유하지 않는다. 파일이 없는 다른 PC에서는 해당 PC의 인증서·계정 준비가 먼저 필요하다.

```powershell
./tools/pc-demo/start.ps1
Invoke-RestMethod http://127.0.0.1:8080/actuator/health
```

실행기는 비밀번호를 CLI 인자로 넘기지 않고 백엔드 프로세스 환경에 전달한다. 프로세스는 별도 창 없이 실행되며 로그와 PID는 로컬 설정의 `runDirectory`에 저장된다. 이미 8080을 사용 중이면 기존 서버를 자동 종료하지 않고 중단한다. `.env` 파일만 수정하는 것으로 실행 중인 백엔드 설정이 바뀌지는 않는다.

`start.ps1`은 PC 내부의 DB·MQTT·백엔드를 켠다. 외부 웹에서 접속하려면 health가 UP인 것을 확인한 뒤 `funnel.ps1 -Action Start`로 HTTPS·WSS 공개 경로를 연다. Funnel의 백그라운드 설정이 이미 남아 있으면 백엔드 기동만으로 접속이 복구될 수 있으므로 공개 상태도 함께 확인한다.

```powershell
# 백엔드 준비 후 인터넷 접속을 연다.
./tools/pc-demo/funnel.ps1 -Action Start
# 시연 종료: 외부 접속을 닫고 백엔드 프로세스까지 종료한다.
./tools/pc-demo/stop.ps1
```

`stop.ps1`은 Funnel을 먼저 닫고 실행 기록의 PID·Java 경로·JAR 인자·생성 시각이 일치하는 백엔드만 종료한다. 공개 해제에 실패하면 백엔드를 유지하고 오류를 표시한다. 기록과 프로세스가 다르면 자동 종료하지 않으며, 이미 종료된 상태에서는 완료 메시지만 표시한다. DB·MQTT 컨테이너와 데이터·실행 기록은 유지한다. 장비 제어 명령을 발행하는 스크립트는 아니다.

DB·MQTT까지 중지하려면 백엔드 종료 후 `docker stop autonomous-mower-mosquitto autonomous-mower-postgres`를 별도로 실행한다. 다음 시연에는 Docker Desktop을 켜고 위 `start.ps1`을 사용한다. 종료 경계의 모의 검사는 `powershell -NoProfile -File tools/pc-demo/stop.test.ps1` 또는 `pwsh -NoProfile -File tools/pc-demo/stop.test.ps1`로 실행하며 실제 Tailscale·프로세스·포트를 변경하지 않는다.

MQTT의 컨테이너 내부 포트는 8883이지만 PC 호스트 포트는 18883이다. 적용 PC에서 8883이 Windows 예약 포트에 포함된 것을 확인해 변경했으며, 다른 PC에서도 예약 포트·실제 바인딩을 확인해야 한다. 브로커는 과거 retained 메시지가 남은 개발 볼륨 대신 별도 `mosquitto-pc-data` 볼륨을 사용한다. 기존 `mosquitto-data`와 DB 볼륨은 보존한다. `down -v`나 volume prune을 실행하지 않는다.

현재 PC용 서버 인증서는 90일, CA는 365일이며 SAN에 localhost와 해당 PC의 Tailscale DNS 이름이 들어 있다. 만료일과 CA 배포를 확인한 뒤 갱신한다. 현재 포트는 loopback 전용이므로 Jetson에서는 아직 접속할 수 없다. 실제 Robot ID가 확인되면 해당 장비 계정·ACL·Tailscale 바인딩을 별도 적용하고 재검증한다.

백엔드는 실제 배포 프론트 Origin을 `APP_ALLOWED_ORIGINS`에 포함한다. 이 단계의 HTTP·WS 검증은 PC 내부 검증이며 HTTPS·WSS의 외부 접속 검증이 아니다. Funnel을 준비·검증한 뒤 Vercel의 `VITE_API_BASE_URL`과 `VITE_WSS_URL`을 등록하고 다시 배포한다. 실제 공개 주소가 준비되기 전에는 위 loopback 주소를 Vercel에 넣지 않는다.

## Funnel로 웹 API 공개

Funnel은 인터넷의 HTTPS·WSS 요청을 PC의 HTTP·WebSocket 백엔드로 전달한다. 웹 화면은 Vercel에 있고 데이터 처리와 로그인은 PC가 담당한다. DB와 MQTT 포트를 Funnel 대상으로 지정하지 않는다. PC·Tailscale·백엔드가 실행 중이어야 요청을 처리할 수 있다.

PC 적용 환경에서 다음과 같이 사용한다. 최초 실행 시 Tailscale 계정의 HTTPS·Funnel 활성화 링크가 나오면 계정 소유자가 로그인해 설정을 완료한다. 설정은 명령 실행 결과와 실제 공개 주소의 접속 결과를 확인해야 완료한 것으로 판단한다.

```powershell
./tools/pc-demo/funnel.ps1 -Action Start
./tools/pc-demo/funnel.ps1 -Action Status
# 시연 종료 시 공개를 해제한다.
./tools/pc-demo/funnel.ps1 -Action Stop
```

실행기는 PC 실행기의 PID 기록과 127.0.0.1:8080 리스너·health를 확인하고, HTTPS 443을 해당 백엔드로만 연결한다. 443에 다른 서비스가 설정되어 있으면 자동으로 덮거나 제거하지 않는다. `--bg` 설정은 재부팅 뒤에도 복구될 수 있으므로 시연을 마치면 Stop으로 공개를 해제한다. Stop은 백엔드·DB·MQTT 프로세스를 종료하는 명령이 아니다.

공개 주소의 HTTPS 로그인·조회, CORS·인증 거부, WSS CONNECT를 검증한 뒤 Vercel Production 환경변수에 다음 실제 값을 넣고 Redeploy한다. `<BACKEND_HOST>`는 Funnel이 확인해 준 DNS 이름이며 임의로 추측해서 입력하지 않는다.

```dotenv
VITE_API_BASE_URL=https://<BACKEND_HOST>
VITE_WSS_URL=wss://<BACKEND_HOST>/ws
```

`VITE_NAVER_MAP_CLIENT_ID`에는 기존 지도용 Client ID를 별도로 등록한다. 프론트 배포 주소의 네이버 지도 Web 서비스 URL 등록과 브라우저의 실제 지도 표시도 확인한다. PC에서 공개 호스트 이름으로 접속한 결과와 Tailscale을 사용하지 않는 외부 휴대폰·브라우저 결과는 구분해서 기록한다. 영상의 WebRTC 미디어 경로와 실제 Jetson의 Tailscale/MQTT 연결은 이 웹 공개 설정과 별도 검증 대상이다.

2026-10-20에는 Start·Stop과 공개 중계 경로의 HTTPS·WSS 13개 검사를 통과했다. 같은 PC에서는 DNS가 내부 Tailscale 주소를 반환할 수 있어 공개 DNS-over-HTTPS 응답의 중계 주소로 연결하고 원래 호스트명·SNI·인증서 검증을 유지했다. 외부 기기의 Vercel 브라우저 검증은 별도로 진행한다.

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
