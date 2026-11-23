# Jetson Edge Client

Jetson Orin Nano에서 Spring Boot 백엔드의 MQTT command topic을 구독하고 ROS 2 topic으로 전달하는 Phase 1 Edge Client입니다.

현재 클라이언트는 MQTT command 검증, ROS 2 제어 출력, command ACK, telemetry/status 발행, 로컬 데드맨 스위치와 E-Stop 상태 처리를 제공한다. 기본 ROS 방식은 `/cmd_vel`을 구독하는 별도 bridge node를 사용한다. `manual_serial.port`를 설정하면 이 패키지의 STM32 USB CDC 시리얼 어댑터를 사용하며, 웹 준비 요청으로 포트를 여는 방식은 아래 관제 대기를 따른다.

## r41 웹 작업 구역과 관측 재생

`jetson_mower_client.r41_web`은 2026-11-21 r41 인수인계 형식의 작업 구역과 장애물 메시지를 PC에서 확인하는 도구다. `edge/jetson-client`에서 Python과 `requirements-vision-map.txt`의 Shapely를 사용한다. 구역 조회 응답 파일에는 서버 응답 전체인 `{success, data}`를 저장하고, 장애물은 `std_msgs/msg/String`의 내용으로 전달된 JSON 객체를 한 줄씩 저장한다.

```powershell
python -m jetson_mower_client.r41_web prepare-zone --robot-id <ROBOT_ID> --expected-version <VERSION> --response-file <WORK_ZONE_RESPONSE.json> --output <NEW_R41_ZONE.json>
python -m jetson_mower_client.r41_web replay-obstacles --robot-id <ROBOT_ID> --expected-version <VERSION> --response-file <WORK_ZONE_RESPONSE.json> --obstacles <OBSTACLES.jsonl>
python -m jetson_mower_client.r41_web replay-preview-routes --robot-id <ROBOT_ID> --expected-version <VERSION> --response-file <WORK_ZONE_RESPONSE.json> --preview-states <PREVIEW_STATES.jsonl>
```

- `prepare-zone`은 로봇·구역 버전·도형을 검사하고 오목한 경계를 보존한다. r41은 외곽 고리만 지원하므로 내부 제외 구역은 거부한다. 새 파일만 생성하며 완성된 파일을 최종 경로에 공개한다. 온라인 조회 시 `--response-file` 자리에 `--api-base-url <HTTPS_API_BASE_URL>`을 사용하고 `MOWER_READ_TOKEN`에 조회 권한이 있는 토큰을 설정한다.
- `replay-obstacles`는 각 원본 스냅샷의 생성 시각을 재생 기준으로 사용한다. 유효한 자세·구역·신선도와 객체 가시성을 확인하고 `last_seen_unix_ms`를 실제 관측 시각으로 보존한다. 인수인계의 `{lat,lon}` 원점과 `{east,north}` m 좌표를 기존 소구역 평면 근사로 변환한다. 사람은 점, 나무·덤불 후보는 패딩 전 관측 영역으로 변환한다. 결과는 기존 관측 POST 본문 형태의 JSONL로 표준 출력에 기록한다. 저장 동작을 시험할 때는 짧은 간격으로 이동한 사람과 동일 관측의 재전송을 격리 서버에서 확인한다.
- `replay-preview-routes`는 기존 무구동 시험기의 `/state.json` 응답을 한 줄씩 모은 JSONL을 입력으로 사용한다. 세션과 작업 구역을 고정하고 WGS84 경로점 순서를 보존한다. 새 revision에서 경로가 오기 전이거나 센서 입력이 무효일 때는 경로 없는 결과를 출력한다.
- 파일 변환과 재생은 로컬에서 처리한다. r41 원본 로그에서 객체 클래스·좌표 구조·객체별 시각을 대조하고, `drive_status`의 경로점·보류·무효화 구조를 확인한 뒤 실제 메시지 구독과 최종 경로 보고 계약을 적용한다.

### r57 백업을 웹에서 재생

인계 ZIP을 풀고 웹의 **작업 이력 → CPP 주행 기록 재생 열기**에서 해당 세션의 `mission-…/mission.jsonl`을 선택한다. PC에서는 `frontend`에서 `npm run dev`를 실행한 뒤 `/mission-replay.html`로 직접 접속해도 된다. 파일 선택부터 지도 표시까지 브라우저에서 처리한다.

재생 버튼은 기록 시각 간격을 따르고 슬라이더는 판단 단위로 이동한다. **경로 변경 시점**에서 최초 계획과 재계획을 바로 비교할 수 있다. 지도는 각 경로 버전의 `path` 끝에서 `path_remaining`개 점을 가져오고, 두 점 미만이면 선을 지운다. 빈 원은 별도로 기록한 `next_waypoint`다. 장애물은 같은 판단의 플래너 입력에서 읽고, 관측이 오래되면 마지막 지도를 흐리게 표시한다. 이 화면은 주행 판단 기록을 재생하며 ROS 토픽 원본 수신과 실시간 송신은 별도 검증 대상이다.

기존 기록을 서버 작업 이력에 연결하려면 운영자가 세션과 서버의 실제 작업 UUID가 일치함을 확인한 뒤 PC 백엔드 호스트에서 `python tools/archive_mission.py <mission.jsonl> <작업_UUID> <보관_디렉터리>`를 실행한다. 보관 디렉터리는 백엔드 실행 위치 기준 `data/mission-replays`이며 `APP_HISTORY_REPLAY_DIRECTORY`로 절대 경로를 지정할 수 있다. 작업 목록을 검색한 뒤 해당 행을 클릭하면 웹이 로그인 세션으로 기록을 읽는다.

웹 AUTO로 관리한 r61 세션의 로그는 별도 업로더가 30초마다 확인한다. 실행 관리자가 생성한 작업 UUID 폴더 안에서 `requested-work-zone.json`과 기록의 구역이 일치해야 한다. 업로더는 플래너가 처음 `permit=true`로 처리한 주행 판단 시각과 `run_end`·`summary.json`이 일치하는 마감 시각을 같은 작업 UUID로 전송한 뒤 재생 파일을 등록한다. 무구동, 주행 허용 전 종료, 마감이 누락된 로그는 자동 등록 대상에서 제외한다. 세션 종료는 작업 이력의 기록 경계다. 바퀴·칼날의 실제 정지 확인이나 AUTO 재무장에는 기존 확인 절차가 적용된다. 별도로 실행한 SSH 세션은 위의 파일 선택으로 재생할 수 있다.

설치 시 인증된 관리자 계정으로 `POST /api/robots/<ROBOT_ID>/edge-work-zone-tokens`에 `{"label":"작업 이력 업로더","purpose":"mission-upload"}`를 보내 해당 로봇의 업로드 전용 토큰을 발급한다. `~/.config/mower-mission-upload.env`를 권한 600으로 만들고 `MOWER_MISSION_API_BASE_URL`, `MOWER_MISSION_ROBOT_ID`, `MOWER_MISSION_UPLOAD_TOKEN`과 게이트웨이와 같은 `MOWER_MISSION_SPOOL` 절대 경로를 지정한다. 사용자 서비스 `mower-mission-upload.service`의 `WorkingDirectory`는 배포한 Jetson 클라이언트 폴더에 맞춰 적용한다. 단독 실행 시에는 같은 환경에서 `python -m jetson_mower_client.mission_upload --api-base-url <HTTPS_API> --robot-id <ROBOT_ID>`를 사용한다. 원본은 로컬에 보존하며, 실패 시 같은 신호 UUID로 다시 시도하고 성공한 기록은 재전송하지 않는다.

웹 실행의 로그 마감은 게이트웨이가 해당 실행 그룹의 종료를 확인한 뒤 업로더에 넘긴다. 업로더는 같은 작업 폴더의 최초 구동 허용 기록, 작업 구역, `run_end`와 `summary.json`을 검증하고 시작·종료 이벤트와 재생 로그를 등록한다. 운영자가 중단한 경우 남은 경로와 관계없이 작업 이력을 종료한다. 이 이벤트는 주행 세션의 종료를 뜻하며 실제 장비 상태에 사용하는 `.confirmed-end.json`은 별도로 검증한다.

r60 무구동 상태를 격리 관제 서버에 전달하려면 서버에서 `APP_JETSON_ROUTE_PREVIEW_WRITE_ENABLED=true`를 설정하고, Jetson의 `MOWER_PREVIEW_TOKEN`에 해당 서버의 조회·제어 쓰기 권한 토큰을 설정한다. 같은 작업 구역이 저장된 시험 로봇을 대상으로 `edge/jetson-client`에서 실행한다.

```bash
python -m jetson_mower_client.cpp_web_preview --api-base-url <HTTPS_API> --robot-id <TEST_ROBOT_ID> --zone <LOCAL_ZONE_JSON> --status-topic /mower_preview_<SESSION>/status
```

이 구독기는 플래너가 사용한 장애물 스냅샷을 상태 메시지에서 읽어서 경로와 같은 판단 시점에 보고한다. 센서 입력이 유효할 때만 남은 경로를 표시하며 갱신이 끊기면 서버의 경로 표시 기한이 만료된다. 장애물 관측은 기존 지도에 저장되므로 전용 시험 로봇을 사용한다. ROS bag은 원래 기록 시각으로 변환 시험에 사용한다.

## 팀원 온라인 CPP에 실제 센서 입력 연결

### 한 명령 실행과 별도 시험 지도

**2026-11-18 카메라 확인과 상태 패널 축약:** 상태를 짧은 가로 표로 표시하고 현재 컬러 영상과 근접 감지 당시 진단 사진을 함께 제공한다. `cpp_camera_preview.py`는 기존 `/camera/camera/color/image_raw/compressed`를 BEST_EFFORT로 구독하고 최대 2Hz로 최신 JPEG만 교체한다. 새 카메라 장치나 추론 모델을 열지 않는다. 이 모듈도 통합 실행기 패키지에 함께 배포해야 한다. HTTP는 실행 폴더의 정해진 이미지 두 종류만 제공하고 임의 파일 경로는 받지 않는다.

진단 사진은 관측기의 `--diagnostic-captures`가 저장한 `*-raw-guard.png`이며 현재 컬러 영상과 같은 시각이라고 보장하지 않는다. 관측기 캡처 제한은 10초 이상 간격·최대 20건이다. 화면에서 촬영 경과 시간을 표시하고 오래된 영상은 흐리게 한다. 빨간 검출 상자는 원본 캡처가 해당 정보를 기록했을 때만 나타난다. 이미지는 이 관측 시험 폴더 안에 저장되므로 공유할 때 현장 영상 포함 여부를 확인한다.

최초 CPP 보류는 프로세스 종료가 아니다. 센서와 비전 추론은 계속 동작하며 새 입력으로 검사를 반복한다. 보호 잠금은 명시적 재개 또는 별도 안전 확인이 필요하다. 자원 사용을 끝내려면 PC 실행 터미널에서 Ctrl+C로 시험을 정상 종료한다. 배포 후 기존 실행기는 한 번 종료·재실행해야 새 HTML과 카메라 자식 프로세스가 적용된다.

**Windows PowerShell 로그인 표시:** `cpp-trial.ps1`은 Windows PowerShell 5에서도 한글 원문을 읽도록 UTF-8 BOM으로 저장하며 SSH 동안 콘솔 입출력을 UTF-8로 설정하고 종료 시 복구한다. SSH 비밀번호와 관제 웹 계정은 별개다. 관제 아이디는 화면에 표시하고 비밀번호만 숨긴다. 관제 로그인 실패는 HTTP 인증 거부·통신 실패·응답 형식 오류로 구분하며 실제 계정·비밀번호·토큰과 서버 응답 본문은 출력하지 않는다. 실제 사용자 로그인 성공은 별도 확인이 필요하다.

**2026-11-18 센서 동기화 가이드 반영·Jetson 배포 완료:** 관측기에 `--dual-gps --diagnostic-captures`를 지정하고 센서 입력은 팀원 `drive_ros.py --jsonl-preview`로 교체했다. 이 모드는 Twist 발행자를 만들지 않는다. 기존 `cpp_sensor_input.py`를 동시에 실행하지 않는다. 팀원 소스는 변경하지 않았으며 최신 가이드는 Jetson의 `gps_cpp_web_integration/TEAM_SENSOR_SYNC_GUIDE.md`다.

지도에는 `blocked_by`와 별도 안전 확인 대기를 표시한다. 최신 유효 자세·local_enu·근접 미감지 상태의 일반 `near_guard_manual_resume_required`에만 미리보기 재개 버튼을 활성화한다. 현장 원인 해소를 확인하고 누르면 다음 새 입력에 1회 요청하며 500ms를 넘기거나 위험·무효 상태면 소비 후 폐기한다. `safety_review_id`가 있는 별도 안전 확인 대기는 해제하지 않는다. HTTP는 loopback 동일 Origin과 전용 헤더를 검사한다. 실차 재무장 API가 아니다.

배포 위치는 `~/cpp_sensor_bridge_20261117/jetson_mower_client/`이며 실행 명령은 아래 PC 스크립트와 같다. PC·Jetson 관련 시험 각각 3개, 실제 배포 모듈과 팀원 JSONL 옵션의 help, 배포 해시 일치 및 JavaScript 재개 상태 검사를 확인했다. 실제 서버 로그인·센서 종단·브라우저 자동 열기는 이번 배포에서 실행하지 않았다. 기존 오프라인·미배포 설명은 초기 구현 시점 기록이며 현재 상태는 이 문단을 따른다.

`jetson_mower_client.cpp_trial`은 구역 조회·팀원 work-plan 생성·지리 좌표 비전 관측·센서 JSONL·팀원 WebCPP를 한 프로세스에서 관리한다. 시험마다 `~/cpp_trial_runs/trial.*` 새 폴더와 전용 장애물 토픽을 사용한다. 관측기의 기존 결과 폴더를 덮어쓰지 않으며 다른 프로그램을 종료하지 않는다. 기존 수동 시험 터미널은 먼저 정상 종료해 추론을 중복 실행하지 않는다.

Jetson 배포 경로 `~/cpp_sensor_bridge_20261117/jetson_mower_client/`에 `cpp_trial.py`, `cpp_trial.html`, `cpp_sensor_input.py`, `__init__.py`가 필요하다. 팀원 모듈·모델은 기존 절대 경로를 기본값으로 사용한다. 초기 구현 때는 Jetson 오프라인으로 미배포였으나 2026-11-18 배포를 완료했다. PC에서 저장소 루트 기준 다음 한 명령을 실행한다.

```powershell
.\tools\pc-demo\cpp-trial.ps1
```

PuTTY가 SSH 로그인과 Jetson 실행을 담당하고 PC의 9877 포트를 Jetson loopback HTTP에 연결한다. SSH 인증 뒤 관제 아이디·비밀번호를 숨김 입력하거나 Jetson 환경의 `MOWER_READ_TOKEN`을 사용한다. 준비되면 브라우저 시험 지도가 자동으로 열린다. PC 포트 9877이 사용 중이면 시작하지 않는다. 서버 주소·로봇은 `-ApiBaseUrl`, `-RobotId`로 지정할 수 있다. 계정 인증과 GUI 브라우저 자동 열기는 실장비 연결 후 검증해야 한다.

창은 북쪽이 위인 미터 단위 평면 지도이며 위성지도 API를 사용하지 않는다. 구역 경계·정적/동적/미확인 장애물·현재 위치·방향·CPP 경로와 보류 사유·관측 나이를 표시한다. 입력이 오래되거나 지도가 무효면 장애물을 흐리게 하고 경로를 사용 가능하게 표시하지 않는다. 관제 웹에 경로를 저장하는 기능은 포함하지 않는다.

Fixed·공분산·시각·근접 보호와 재개 잠금은 팀원 모듈과 기존 센서 연결부의 기준을 유지한다. 구역 변경 시 시험 전체를 중단하고 새 실행에서 새 지도를 준비한다. 일반 근접 보호 대기는 위의 명시적 미리보기 재개 절차를 따르며 별도 안전 확인 잠금은 유지한다. 자식 프로그램 종료·Ctrl+C·정상 전달된 SSH 종료 신호에는 자신이 생성한 프로세스 그룹만 정리한다. 전원 단절·SIGKILL에서는 정상 정리를 보장하지 않는다. `drive_ros.py`·STM32·AUTO·예초 제어는 실행하지 않는다.

PC에서는 자식 프로세스 실패 시 정리와 원본 시각 보존 시험, 지도 JavaScript 구문·두 화면 폭 좌표 계산·보류 상태 표시, PowerShell 구문을 확인했다. 실제 브라우저 검사는 Playwright 확장 부재로 실행하지 못했고 Jetson 오프라인으로 센서·팀원 모듈·로그인 종단 실행도 미검증이다.

`cpp_sensor_input.py`는 ROS 구독만 사용해 팀원 `/home/jangwoo/gps_cpp_web_integration/web_cpp.py`에 JSONL 입력을 제공한다. 별도 배포 경로는 `/home/jangwoo/cpp_sensor_bridge_20261117/`이며 관제·카메라·센서 서비스와 팀원 소스는 변경하지 않는다. 서버로 장애물·경로를 전송하거나 AUTO·시리얼·날 제어를 실행하는 기능은 없다.

- 위치 `/dual_gps/fix`와 방향 `/dual_gps/odom`은 측정 시각이 정확히 같은 쌍을 사용한다. 공분산 미확인·무효 방향·준비 신호 만료를 거부한다. 원본 위치·방향 측정과 로컬 수신 모두 500ms 이내여야 하며 수평 표준편차는 팀원 기준 0.10m 이하다.
- 각속도는 연속 두 GPS 방향의 차이를 정규화해 계산한 시험용 추정치다. `adapter.yaw_rate_source=dual_gps_difference_preview_only`로 표시하고 실제 IMU 각속도나 실주행 검증값으로 해석하지 않는다. 1Hz GPS에서는 초기 두 측정을 기다리고 매 주기의 일부만 500ms 조건을 만족한다. 이를 숨기려고 시각을 재발행 시각으로 바꾸지 않는다.
- 장애물 스냅샷의 실제 촬영 시각·원점·세션·구역 버전·유효 상태는 보충하지 않고 그대로 전달한다. 수신이 끊겨도 200ms마다 입력을 내보내므로 팀원 실행기가 만료 상태를 검사할 수 있다. `cutting=false`, `motion_preview_enabled=false`를 고정한다.
- 구역 없는 `rotation_trial` 관측을 실제 구역으로 바꾸지 않는다. 새 `work-plan`으로 지리 좌표 관측을 시작해야 한다. 구역 버전 변경 시 계획을 다시 내보내고 관측기도 같은 구역·버전으로 시작한다.

다음은 팀원이 실행할 수 있는 순서다. `<시험폴더>`는 별도로 만든 절대 경로다. 현재 관측기를 임의 종료하지 않으며 추가 관측기를 시작하기 전 카메라 공유·추론 부하를 확인한다. 기존 5×5 실행기는 사용하지 않는다.

1. 첫 터미널에서 작업 구역 조회를 유지한다. 토큰은 채팅·명령 인자·저장소 파일에 넣지 않는다.

```bash
read -rs -p '구역 조회 토큰: ' MOWER_READ_TOKEN; echo
export MOWER_READ_TOKEN
python3 /home/jangwoo/gps_cpp_web_integration/web_zone.py \
  https://<BACKEND_HOST> MOWER-01 --state <시험폴더>/web_work_zone_state.json
```

2. 두 번째 터미널에서 현재 구역의 작업 계획을 내보낸다. 조회 성공 상태가 9초 이내여야 한다.

```bash
python3 /home/jangwoo/gps_cpp_web_integration/web_cpp.py \
  <시험폴더>/web_work_zone_state.json --export-work-plan > <시험폴더>/work-plan.json
```

3. 팀원 비전 환경에서 기존 관측기의 `--work-plan`에 위 파일을 지정한다. 별도 관측 시험의 ROS remap은 아래와 같다. 모델·Python 의존 환경은 팀원 관측기의 기존 설정을 유지한다.

```bash
python3 /home/jangwoo/drive_test_observer_stationary.pf9DBA/recorder.py \
  --output <시험폴더>/observations --semantic-model <모델_절대경로> \
  --work-plan <시험폴더>/work-plan.json --ros-args \
  -r __node:=cpp_trial_observer -r /fix:=/dual_gps/fix \
  -r /drive_test/odom:=/dual_gps/odom \
  -r /drive_test/yaw_ready:=/dual_gps/yaw_ready \
  -r /drive_test/obstacle_snapshot:=/cpp_trial/obstacle_snapshot
```

4. ROS 환경을 불러온 새 터미널에서 센서 연결부와 CPP 미리보기를 연결한다.

```bash
source /opt/ros/humble/setup.bash
export PYTHONPATH="/home/jangwoo/cpp_sensor_bridge_20261117:${PYTHONPATH:-}"
set -o pipefail
python3 -m jetson_mower_client.cpp_sensor_input \
  --obstacle-topic /cpp_trial/obstacle_snapshot |
  python3 /home/jangwoo/gps_cpp_web_integration/web_cpp.py \
    <시험폴더>/web_work_zone_state.json > <시험폴더>/cpp-preview.jsonl
```

`planning.remaining_path`가 경로이며 `route_revision`은 해당 계획기 인스턴스 안의 변경 번호다. 전역 경로 ID나 주행 허가는 아니다. `sensor_hold`·`work_zone_unavailable`·`invalid_work_zone_or_sensor_input`은 실패 원인과 함께 확인한다. 근접 경고로 팀원 `Mission`의 재개 대기가 잠기면 이 연결부는 자동 해제하지 않는다. 현재 시험에서는 원인을 해소한 뒤 미리보기 파이프라인을 다시 시작하며 관제 재개 입력 연결은 별도 작업이다.

PC·Jetson에서 연결부 단위 시험 각각 5개가 통과했다. 팀원 `WebCPP`에 합성 입력을 연결해 경로 75점 생성과 만료 시 계획 보류를 확인했다. 실제 ROS 입력 8초에서 JSONL 37개를 읽었으나 당시 관측은 구역 식별자 없는 `rotation_trial`이어서 CPP가 모두 거부했다. 실제 서버 조회·지리 좌표 관측과의 종단 CPP·실제 방향/물체 위치 정확도·주행은 미검증이다.

## 전원 ON 시 듀얼 GPS 자동 시작

2026-11-17 방향 반전 요청에 따라 수신기의 기본 입력 순서를 교환했다. 논리 주 안테나는 `/dev/gps_aux`, 전방 보조 안테나는 `/dev/gps_main`을 읽는다. 기존 udev 별칭은 다른 프로그램과의 호환을 위해 유지한다. 이 변경은 웹 화살표만 돌리지 않고 위치 기준과 비전 투영에 쓰는 방향에도 적용된다. RTK는 기존처럼 양쪽에 전달한다. 설치된 센서 파일을 백업한 뒤 교체하고 센서 서비스만 재시작했다. 이전에 저장된 비전 영역은 자동 보정되지 않으므로 새 세션의 관측으로 비교해야 한다. 입력 교환 시 180° 반전되는 계산은 시험했으나 실제 기체 방위와의 일치는 별도로 확인해야 한다.

2026-11-16 Jetson에 `mower-dual-gps.service`와 `mower-dual-gps-rtk.service`를 설치하고 둘 다 enabled로 등록했다. 사용자 관리자 `Linger=yes`도 확인해 로그인·SSH 없이 부팅 때 시작되는 구성이다. 장치 별칭이 생길 때까지 기다리며 프로세스가 실패하면 10초 뒤 재시도한다. 수신 서비스 재시작 후 실제 위치·방향 복구를 확인했으며, 이번 작업에서 실제 재부팅·전원 재인가 시험은 하지 않았다.

- 주 GPS의 새 위치는 `/fix`와 `/dual_gps/main_fix`로 전달해 기존 관제 위치 수신을 유지한다. 두 번째 GPS의 Fixed 여부와 별개로 주 GPS 위치는 표시할 수 있다.
- 양쪽 Fixed·같은 측정 시각·43cm 기준선 검사를 통과한 위치와 방향만 `/dual_gps/fix`, `/dual_gps/odom`, `/dual_gps/yaw_ready`에 제공한다. 일반 위치 표시를 유효 방향으로 해석하지 않는다. 상태는 `/dual_gps/status`에서 확인한다.
- RTK 보정은 기존 장비 설정을 양쪽 GPS로 전달한다. 비공개 설정은 `~/.config/mower-dual-gps/ntrip.json`에 사용자 소유 600 권한으로 보관한다. RTK 도구 출력에는 접속 정보가 포함될 수 있어 journal로 보내지 않는다.
- 설치된 코드는 `~/.local/share/mower-dual-gps/releases/20261116-boot/`, 서비스 실행 경로는 그 위치를 가리키는 `~/.local/share/mower-dual-gps/current`다. 저장소의 `scripts/run-dual-gps*.sh`와 `systemd/mower-dual-gps*.service`를 배포했다.

자동 시작 범위는 센서 수신과 RTK 보정이다. 비전 추론·웹 구역 조회·관측 전송·주행 스크립트를 새로 자동 실행하지 않는다. 후속 관제 연결은 아래 기체 방향 절을 따른다. 듀얼 방향은 별도 비전 실행기도 위 토픽으로 사용한다.

### 관제 웹의 기체 방향 연결

센서 상태에 북쪽 0°·동쪽 90°의 `headingDegrees`와 실제 측정 시각 `headingObservedAt`을 포함한다. 관제 게이트웨이의 `TelemetryHeading`이 양쪽 Fixed·출처·측정 시각을 확인해 기존 MQTT telemetry에 `headingSource:"dual-gps"`와 함께 전달한다. 무효 신호와 3초 만료에서는 방향을 null로 전송하며 같은 측정의 반복 보고로 수명을 연장하지 않는다. 위치 표시와 방향의 유효성은 독립적이다.

이전 설명의 ‘웹이 IMU 방향을 사용한다’는 내용은 잘못됐다. 변경 전 웹은 GPS 좌표 변화에서 이동 방향을 계산했고, Jetson의 IMU 구독값은 telemetry 방향으로 보내지 않았다. 새 웹 코드는 위치 변화 추정을 제거하고 듀얼 GPS의 기체 방향을 사용한다. 정지·후진 시에도 기체 전방을 뜻하며 실제 이동 방향과 혼동하지 않는다.

Jetson 관제 서비스는 `7971263-pwm400-dual-heading` 별도 배포본으로 전환했고 센서 자동 시작 배포본도 상태 필드를 갱신했다. STM32 포트 미점유와 cmd_vel 구독자 0을 확인한 뒤 게이트웨이를 재시작했다. 이전 설정 백업은 `~/.local/share/mower-control-gateway/mower-control-gateway.before-dual-heading.service`이며 기존 배포본과 비공개 설정은 보존했다. 실제 MQTT에 dual-gps 방향이 들어오는 것을 확인했고 백엔드도 적용했다. 운영 프런트 배포와 실제 방위 비교는 아직 수행하지 않았다. 기존 비전·관측 전송의 상시 실행 범위는 확장하지 않는다.

```bash
systemctl --user is-enabled mower-dual-gps.service mower-dual-gps-rtk.service
systemctl --user is-active mower-dual-gps.service mower-dual-gps-rtk.service
source /opt/ros/humble/setup.bash
ros2 topic echo /dual_gps/status std_msgs/msg/String --once --full-length
```

다른 프로그램에서 GPS 포트를 열기 전에는 두 서비스를 함께 중지한다. 기존 `mower_test.sh`처럼 자체 GPS·보정 수신기를 실행하는 스크립트와 동시에 사용하지 않는다. 기존 5×5 스크립트는 수정하지 않았다. 듀얼 GPS를 자동 시작하지 않도록 복구하려면 다음 명령으로 등록을 해제하고 필요할 때 단일 GPS 수신기를 별도 실행한다. 이전에 실행 중이던 수신기 명령은 배포 폴더 상위의 `previous-gps-command.json`에 보관했다.

```bash
systemctl --user disable --now mower-dual-gps.service mower-dual-gps-rtk.service
```

## 듀얼 GPS를 이용한 시험용 비전 전역 지도

2026-11-16 별도 모듈 `dual_gps_node.py`와 `dual_gps_vision.py`를 준비했다. 주 안테나에서 전방 0.43m에 보조 안테나가 있는 배치다. 양쪽 RTK Fixed, GGA·RMC의 같은 실제 측정 시각, 3초 미만 측정·수신, 기준선 0.43m±0.05m를 초기 시험 조건으로 사용한다. ±0.05m는 기준선 이상을 거르는 시험값이며 위치 정확도나 안전거리의 보장이 아니다. Fixed 해제·시각 불일치·미수신 때 새 방향을 만들지 않는다.

두 포트를 이 수신기가 읽고 `/dual_gps/fix`, `/dual_gps/odom`, `/dual_gps/yaw_ready`, `/dual_gps/status`를 발행한다. 방향은 ENU 동쪽 0·반시계 양수이며 `/dual_gps/odom`은 방향 전달 전용이다. 위치는 주 안테나의 `/dual_gps/fix`를 사용한다. 공분산은 설치된 NMEA 드라이버의 GST 또는 품질별 근사값이며, 표시된 작은 수치가 실제 위치 오차 실측값은 아니다. 카메라·차체 중심과 주 안테나의 정확한 오프셋 및 이동 중 정확도는 미검증이다.

기존 팀원 `recorder.py`는 덮어쓰지 않고 별도 실행기에서 불러온다. 같은 측정 시각의 위치·방향과 카메라 IMU가 준비된 뒤 원래 기록기에 넘기며, 상태 만료 시 화면 상태도 무효로 바꾼다. 기존 제자리 회전 시험과 별도 토픽·출력 폴더를 사용한다. 후속 HTTPS 연결은 아래와 같으며 ROS 구동 명령과 CPP 실행은 추가하지 않는다.

장비에 복사한 위치는 `~/dual_gps_map_20261116/`이다. 실제 시험 데이터는 `map-data/`, 입력 단절 확인은 `gap-map-data/`와 `gap-check.json`에 있다. 시험에서는 전역 원점·위치 기록 57개와 덤불 후보의 GPS 좌표 생성을 확인했다. 네이버 지도 화면 표시나 실제 물체와의 위치 오차 비교는 수행하지 않았다. 임시 시험을 종료하고 기존 GPS 수신기와 기존 비전 시험을 유지했다. 이 첫 연결 시험에서는 상시 서비스를 설치하지 않았으며, 이후 센서 자동 시작은 위 절에 추가했다.

자동 센서 서비스를 사용하는 경우 아래의 수동 GPS 수신기를 중복 실행하지 않고 비전 실행 단계부터 진행한다. 수동 시험으로 전환할 때는 먼저 자동 센서·보정 서비스를 중지하고 두 GPS 포트 점유를 확인한다. RTK 보정은 기존 장비 설정을 이용해 실행해야 하며, 자격증명은 이 문서에 복사하지 않는다. GPS가 Fixed로 바뀌지 않으면 이 연결기는 전역 위치 생성을 보류한다. GPS 수신기는 비전용 NumPy 경로와 분리한 환경에서 실행한다. 시험에서는 비전 NumPy 1.26과 기존 ROS `transforms3d`의 `np.float` 사용이 충돌했으므로 공용 패키지를 덮어쓰지 않았다.

```bash
env -u PYTHONPATH bash --noprofile --norc -c 'source /opt/ros/humble/setup.bash; export PYTHONPATH="$HOME/.local/share/mower-dual-gps/current:${PYTHONPATH:-}"; python3 -m jetson_mower_client.dual_gps_node'
```

다각형 처리는 `requirements-vision-map.txt`를 이용해 별도 vendor 경로에 설치한다. 기존 비전 환경의 NumPy를 사용하므로 `python3 -m pip install --target ~/dual_gps_map_20261116/vendor --no-deps -r requirements-vision-map.txt`처럼 의존성을 공용 환경에 설치하지 않는다. 두 번째 터미널에서는 `control:write` 권한이 있는 로그인 토큰을 입력하고 매번 새 출력 경로로 다음을 실행한다. 토큰은 명령 인자나 Git 파일에 적지 않는다.

```bash
source /opt/ros/humble/setup.bash
export PYTHONPATH="$HOME/dual_gps_map_20261116:$HOME/dual_gps_map_20261116/vendor:$HOME/mower_semantic_lib:${PYTHONPATH:-}"
read -rs -p '관제 로그인 토큰: ' WORK_ZONE_API_TOKEN; echo
export WORK_ZONE_API_TOKEN
trial_output=$(mktemp -d "$HOME/drive_test_runs/dual-gps.XXXXXX")
python3 -m jetson_mower_client.dual_gps_vision \
  --team-dir "$HOME/drive_test_observer_semantic_trial" \
  --output "$trial_output/data" \
  --semantic-model "$HOME/drive_test_observer_semantic_trial/models/yolo26s-sem-ade20k.onnx" \
  --api-base-url "https://<BACKEND_HOST>" --robot-id "<ROBOT_ID>" --expected-version <구역_버전>
```

입력 상태는 `ros2 topic echo /dual_gps/status std_msgs/msg/String --once --full-length`로 확인한다. 결과 폴더의 `state.json`에서 `pose_ready`, `heading_source`, `map`, `last_map_result`를 확인한다. 시험용 화면은 해당 데이터 폴더를 loopback HTTP 서버로 제공하고 SSH 포트 포워딩으로 열 수 있다. 예를 들어 세 번째 터미널에서 `python3 -m http.server 8768 --bind 127.0.0.1 --directory <데이터_폴더>`를 실행한다. 이 설명은 실제 브라우저 표시 검증을 대신하지 않는다.

### 웹 작업 구역과 관측 저장 연결

`dual_gps_vision`은 시작할 때 인증된 GET work-zone으로 다각형과 버전을 조회·검증하고 그 구역으로 20cm 격자를 만든다. 오목한 경계와 내부 제외 영역을 유지하며 최대 10만 셀을 허용한다. 받아 둔 구역과 해시를 출력 폴더의 `work-zone.json`에 기록한다. 구역은 실행 동안 고정하며 구역 변경 후에는 새 버전으로 다시 시작해야 한다.

별도 터미널에 비전과 같은 환경 및 토큰을 준비한 뒤 `python3 -m jetson_mower_client.vision_web_sender --api-base-url "https://<BACKEND_HOST>" --robot-id "<ROBOT_ID>" --data-dir <데이터_폴더>`로 전송한다. 현재 위치·방향이 유효하고 3초 미만인 실제 촬영 결과만 변환한다. 사람은 서버의 반경 1m 위험 표시, 나무·덤불은 `UNKNOWN` 후보 영역을 사용한다. 기존 네이버 지도에서 ‘비전 표시’를 켜면 기존 조회 API로 읽는다. 객체 미검출만으로 자유 공간이나 위험 해제를 만들지 않는다.

서버는 기존 `control:write` 권한을 사용한다. 이는 장비 신원을 보증하지 않으며 입력은 지도 검토용이다. 세션·촬영 시각·물체 순번으로 관측 ID를 고정하고 실패한 한 프레임을 `web-pending.json`에 보관해 재시도한다. 대기 중 새 프레임을 모두 저장하는 큐가 아니며, 중간 관측은 빠질 수 있다. 4xx 응답은 인증·구역 버전·입력 확인이 필요하므로 중단한다. 서버가 처리한 뒤 응답만 유실돼도 같은 ID로 재전송한다. 외부 주소로의 HTTP 리다이렉트는 따르지 않는다.

2026-11-16 실제 구역 버전 9를 109×199셀로 구성하고, Jetson 실제 관측의 HTTPS 저장 및 재조회에서 `UNKNOWN` 영역 3개를 확인했다. 사용자는 관제 작업 지도의 비전 표시를 켜고 미확인 영역이 보인다고 확인했다. 에이전트의 직접 브라우저 캡처 검증은 아니다. 새 백엔드 빌드를 PC에 적용했다. 임시 입력·비전·전송·보정은 시험 후 종료했고 이전 GPS 수신기와 기존 비전 시험을 유지했다. 비전·관측 전송 자동 실행 서비스는 설치하지 않았다. 물체의 실제 위치 오차·이동 시험은 별도다.

## 웹 버튼에서 수동 제어 준비

예전 시험 서비스를 매번 수동 실행하는 대신, `mower-control-gateway.service` 하나가 상태 전송과 MQTT 명령 수신을 담당하도록 구성했다. 프로세스 시작만으로 시리얼 포트를 열지 않는다. 웹의 `수동 조작 재개`가 인증·제어권·일회용 확인값 검사를 거친 `manual-prepare`를 보낸 뒤에만 제어 포트를 연다. 기존 `monitor.py`와 `mower-telemetry.service`는 상태 전용 방식으로 그대로 남긴다.

1. 재개 클릭 후 최대 30초 동안 준비한다. 포트를 연 뒤 새로 수신한 STM32 진단이 중립이고 hold가 종료됐는지 확인한다. 리모컨을 일부러 움직이는 절차는 요구하지 않는다. 이 진단은 STM32 상태 수신 확인이며 리모컨 전원·무선 연결의 정상 여부를 보증하지 않는다.
2. 준비 완료는 이동 명령이 아니다. 웹이 새 확인값으로 재개 요청을 하고 장비 수신 확인 후 방향 버튼을 켠다. 준비 완료 후 재개까지의 장비 대기 한도는 2초다.
3. 별도로 방향 버튼을 누르고 있는 동안만 이동한다. 저장소 코드는 사용자가 요청한 출력 편차 최대 ±400을 적용하며, 기존 350ms 입력 수명·리모컨 우선을 유지한다. 이는 실제 속도 4배를 보장하지 않으며 실제 속도·정지 거리는 별도 검증 대상이다. 일반 정지·취소·단절·준비 만료 또는 리모컨 개입으로 재개가 풀리면 포트를 닫는다. 포인터 해제는 기존 누름 식별자의 정지를 보내며 서버 데드맨 정지도 유지한다.

2026-11-12에는 Jetson의 `~/.local/share/mower-control-gateway/releases/7971263-pwm400/`에 변경 파일을 적용하고 서비스를 전환했다. 당시 서비스와 MQTT 연결을 확인하고 모의 시험 36개를 통과했으며, 실제 이동 시험은 하지 않았다. 기존 서비스 설정 백업은 `~/.local/share/mower-control-gateway/mower-control-gateway.before-pwm400.service`에 보관했다. 현재 실행 상태는 별도 확인이 필요하다.

장비의 비공개 `config.yaml`에 다음을 설정한다. 포트는 실제 연결을 확인해 지정한다. 기본 `on_demand: false`는 기존 실행 방식과 호환되며 새 실행기는 `true`가 아니면 종료한다.

```yaml
manual_serial:
  port: /dev/ttyACM0
  on_demand: true
```

전제는 pyserial과 `fuser`(Ubuntu `psmisc`) 설치, 포트 접근 권한이다. 점유 프로그램이 있거나 확인할 수 없으면 준비를 거부한다. 개방 전후 `fuser`, pyserial exclusive와 Linux `TIOCEXCL`을 사용한다. 현장 방향키 시험·ROS 시리얼 브리지와 동시에 사용하지 않는다. 기존 센서 전용 서비스와 같은 MQTT ID로 동시에 실행하지 않는다.

아래는 **현장 담당자와 바퀴·날 격리를 확인한 뒤 적용할 절차**의 예시다. 홈 저장소를 직접 실행하는 배치이며, 아래 실제 설치 기록의 별도 배포 폴더를 사용할 때는 unit 경로를 바꿔야 한다. 새 웹·서버·장비 코드를 함께 적용하고 비공개 설정은 보존한다.

```bash
systemctl --user disable --now mower-telemetry.service
mkdir -p ~/.config/systemd/user
cp ~/autonomous-mower/edge/jetson-client/systemd/mower-control-gateway.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now mower-control-gateway.service
journalctl --user -u mower-control-gateway.service -n 50 --no-pager
```

unit의 `Conflicts`로 동시 실행을 막는다. 이전 서비스를 disable하는 것은 재부팅 때 두 서비스가 함께 시작되는 것을 막기 위해서다. 로그인 전 자동 실행 여부는 기존 사용자 linger 설정에 따르며 이 절차에서 바꾸지 않는다. 정상 대기 때 포트 미점유, 웹 준비와 리모컨 확인, 별도 방향 누름·해제 정지를 최소 한 번 현장에서 검증한다. 재시작은 재개·이동을 복원하지 않는다. 웹 정지·비상 정지는 현장 리모컨 구동까지 차단한다는 뜻이 아니다.

기존 상태 전용 방식으로 돌아가려면 다음과 같이 전환한다. 자동 복구로 두 서비스를 함께 띄우지 않는다.

```bash
systemctl --user disable --now mower-control-gateway.service
systemctl --user enable --now mower-telemetry.service
```

### 2026-11-11 실제 설치 기록

**2026-11-12 수동 잠금 진단 갱신:** 사용자에게 바퀴·날 격리와 담당자 동행을 확인받고 커밋 `7971263`을 `~/.local/share/mower-control-gateway/releases/7971263/edge/jetson-client/`에 별도 설치했다. 기존 비공개 설정을 보존했으며 이전 unit은 `~/.local/share/mower-control-gateway/mower-control-gateway.before-7971263.service`에 백업했다. 새 서비스 실행, MQTT 연결과 구독 요청, 대기 중 시리얼 포트 미점유 및 수동 상태·세션 단위 시험 12개를 확인했다. 웹 요청, 원인 진단 종단 전달과 실제 장비 출력은 미검증이다. 백엔드와 웹에도 해당 버전이 적용되어야 새 원인 표시가 가능하다.

**2026-11-12 갱신:** 바퀴·날 격리와 담당자 동행 확인 후 커밋 `6a2ffa6`을 `~/.local/share/mower-control-gateway/releases/6a2ffa6/edge/jetson-client/`에 배치하고 기존 비공개 설정을 복사했다. 기존 unit은 `~/.local/share/mower-control-gateway/mower-control-gateway.before-6a2ffa6.service`에 보관했다. 관제 서비스의 새 실행 경로·MQTT 연결 및 구독 요청과 대기 중 시리얼 포트 미점유를 확인했다. 이동 명령, 웹 재개와 물리 정지·리모컨 우선은 시험하지 않았다. 이전 버전 복구 시 백업 unit을 복원하고 사용자 systemd를 재적용해야 하며 실제 장비 상태를 먼저 확인한다.

사용자가 바퀴·날 격리와 현장 담당자 동행을 확인한 뒤 설치했다. Jetson 홈 저장소에 현장 수정본이 있어 직접 덮어쓰지 않고 `~/.local/share/mower-control-gateway/releases/7b4da6d/edge/jetson-client/`에 해당 커밋을 배치했다. 실제 사용자 unit의 작업·실행 경로도 이 폴더로 지정했다. 기존 비공개 설정을 배포 폴더에 복사해 권한 600으로 보관하고 `manual_serial.on_demand: true`와 `/dev/serial/by-id/<STM32_DEVICE>`를 설정했다. 기존 설정 원본과 팀 ROS 작업 공간은 보존했다.

`mower-control-gateway.service`가 active·enabled이며 사용자 `Linger=yes`를 확인했다. 부팅 후 로그인 없이 사용자 서비스가 시작되는 설정이다. 기존 `mower-telemetry.service`는 중지·자동 실행 해제했다. MQTT 연결과 명령 토픽 구독 요청 5개, 대기 중 STM32 포트 미점유, 기존 GPS·카메라·영상 서비스의 실행 유지를 확인했다. 실제 재부팅이나 새 서비스의 웹 재개·물리 동작은 시험하지 않았다. GPS 전용 드라이버의 부팅 자동 실행 설정은 이번에 바꾸지 않았다.

기존 PC 백엔드 JAR에는 준비 API가 없어 최신 코드를 별도로 빌드한 뒤 기존 실행 설정으로 교체·재시작하고 health `UP`을 확인했다. DB·MQTT 컨테이너와 공개 경로 설정은 유지했다. 웹은 새 준비 흐름이 포함된 버전이어야 하며 화면 새로고침만으로 배포 버전이 검증된 것은 아니다.

첫 배포는 Windows의 `core.autocrlf=true`가 `git archive` 출력의 실행 스크립트를 CRLF로 바꿔 시작에 실패했다. 기존 상태 서비스를 복구한 뒤 배포 스크립트를 LF로 정규화해 해결했다. 아카이브를 만들 때는 `git -c core.autocrlf=false archive ...`를 사용하고, 저장소에는 해당 실행기의 `text eol=lf` 규칙을 추가했다. `bash -n`만으로는 `set -eo pipefail` 인수 뒤 CR 문자를 발견하지 못하므로 실제 파일 바이트와 실행 결과도 확인한다.

장비의 `~/.local/share/mower-control-gateway/installation.json`에는 배포 경로·이전 서비스 상태·설정 원본 해시·실행기 해시를, `verification.json`에는 설치 확인 결과를 기록했다. 같은 폴더의 `before-<설치시각>/`에는 이전 상태 서비스 unit을 보관했다. 비밀번호나 토큰은 이 기록에 넣지 않았다. 복구는 위의 새 서비스 중지·비활성화와 기존 상태 서비스 활성화 절차를 따른다. PC에서 이후 코드를 푸시해도 이 배포본이 자동 갱신되지는 않는다.

## 대상 환경

- NVIDIA Jetson Orin Nano 16GB
- JetPack 6.2 / L4T 36.5
- Ubuntu 22.04
- ROS 2 Humble
- Python 3.10

## MQTT 계약

`docs/mqtt-topic-contract.md`를 기준으로 구현합니다.

구독:

- `mowers/{robotId}/commands/manual`
- `mowers/{robotId}/commands/stop`
- `mowers/{robotId}/commands/estop`
- `mowers/{robotId}/commands/mode`
- `mowers/{robotId}/commands/attachment`

발행:

- `mowers/{robotId}/commands/ack`
- `mowers/{robotId}/telemetry`
- `mowers/{robotId}/status`

참고: 현재 MQTT 계약의 manual direction은 `backward`이고, 기존 프론트엔드 타입에는 `reverse`가 남아 있습니다. Phase 1 client는 계약값 `backward`와 호환값 `reverse`를 모두 `/cmd_vel` 후진으로 처리합니다.

## 설치

Jetson에서 ROS 2 Humble 환경을 먼저 source합니다.

```bash
source /opt/ros/humble/setup.bash
```

의존성을 설치합니다.

```bash
cd edge/jetson-client
python3 -m pip install -r requirements.txt
```

ROS 2 workspace에 넣어 빌드하는 경우:

```bash
mkdir -p ~/mower_ws/src
cp -r edge/jetson-client ~/mower_ws/src/jetson_mower_client
cd ~/mower_ws
rosdep install --from-paths src -y --ignore-src
colcon build --packages-select jetson_mower_client
source install/setup.bash
```

## 설정

텔레메트리는 센서별로 값 또는 `null`을 보낸다. 유효한 GPS fix가 최근 3초 안에 도착하면 위치를 보내며, GPS 미수신·fix 실패·유효 범위 밖의 위치는 두 좌표 모두 `null`이다. 배터리·속도·신호는 실제 입력원이 아직 없어 `null`이며, 설정 기본값을 실측값처럼 발행하지 않는다. 초기 모드·작업은 미수신으로 시작한다. 명령으로 갱신되는 로컬 소프트웨어 상태와 STM32의 물리 실행 결과는 구분해야 한다.

`main.py`는 기존 제어 publisher를 포함하는 프로그램이다. 텔레메트리 계약 변경만 확인하려고 실제 장비에서 전체 클라이언트를 실행하지 않는다. PC 검사는 `python -m unittest discover -s tests -v`를 사용하며 실제 센서·MQTT·ROS·구동 검증과 구분한다.

예시 설정 파일을 복사해서 로컬 값으로 수정합니다.

```bash
cp config.yaml.example config.yaml
```

주요 값:

- `robot_id`: MQTT topic의 `{robotId}`와 payload `robotId`
- `mqtt.broker_url`: MQTT broker URL
- `mqtt.ca_cert_path`: `mqtts://`에서 사용할 신뢰 CA PEM 파일 경로. 절대 경로를 권장하며, 상대 경로는 실행 디렉터리를 기준으로 한다. 비워 두면 시스템 기본 CA를 사용한다. CA 경로와 `mqtt://`를 함께 지정하면 시작을 거부한다. TLS는 1.2 이상으로 제한하고 서버 인증서와 호스트명을 검증한다.
- `ros.cmd_vel_topic`: 주행 명령 publish topic. 기본값은 `/cmd_vel`
- `ros.cmd_vel_qos_depth`: `/cmd_vel` publisher의 `keep_last` depth. 기본값은 `10`
- `ros.cmd_vel_qos_durability`: `/cmd_vel` publisher durability. 기본값은 `volatile`
- `ros.cmd_vel_qos_reliability`: `/cmd_vel` publisher reliability. 기본값은 `reliable`
- `ros.fix_topic`: GPS 구독 topic. 기본값은 `/fix`
- `ros.imu_topic`: IMU 구독 topic. 기본값은 `/camera/imu`

## 실행

### 상태 전송 전용 실행과 전원 ON 자동 시작

웹 연결만 확인할 때는 `jetson_mower_client.monitor`를 사용한다. 이 프로그램은 `/fix`만 구독하고 MQTT의 자기 로봇 `telemetry`·`status`만 발행한다. MQTT 명령 구독·처리와 ROS 주행·모드·엔진 출력, 시리얼 장치 접근은 하지 않는다. ROS 자체의 `/parameter_events` publisher는 존재할 수 있지만 제어 출력은 아니다. `온라인`은 상태 전송 프로그램의 연결을 의미하며 센서·STM32·예초 작업 정상 여부를 보증하지 않는다.

실제 TLS 계정·CA가 준비된 `config.yaml`을 유지하고 상태 전용 실행기를 사용한다. 이 실행기는 현재 터미널의 위치와 관계없이 자신의 소스 경로와 설정을 사용하므로 다른 ROS 작업공간 설치본을 잘못 실행하지 않는다.

```bash
bash "$HOME/autonomous-mower/edge/jetson-client/scripts/run-telemetry-monitor.sh"
```

전원 ON 자동 실행은 사용자 systemd 서비스로 등록한다. 아래 unit은 저장소가 `$HOME/autonomous-mower`에 있는 경우를 기준으로 한다. 다른 위치라면 unit의 두 경로를 실제 위치에 맞춘다. 기존 서비스가 있으면 먼저 내용을 확인하고 덮어쓰지 않는다.

```bash
mkdir -p "$HOME/.config/systemd/user"
cp "$HOME/autonomous-mower/edge/jetson-client/systemd/mower-telemetry.service" "$HOME/.config/systemd/user/"
systemctl --user daemon-reload
loginctl enable-linger "$USER"
systemctl --user enable --now mower-telemetry.service
```

`enable-linger`는 로그인 전에도 사용자 서비스를 시작하고 SSH 연결 종료 후 유지하도록 한다. 서비스는 PC·Tailscale이 늦게 준비되거나 프로그램이 종료되면 10초 간격으로 재시도한다. 네트워크가 끊긴 동안 새 측정 메시지를 계속 쌓지 않으며 GPS가 3초 이상 갱신되지 않으면 위치를 null로 보낸다. 실제 재부팅·전원 ON 검증은 서비스 등록·현재 실행 확인과 구분한다.

```bash
systemctl --user status mower-telemetry.service --no-pager
systemctl --user restart mower-telemetry.service
# 이번 실행만 중지: 다음 부팅의 자동 실행 등록은 유지한다.
systemctl --user stop mower-telemetry.service
# 자동 실행도 해제하고 현재 실행을 중지한다.
systemctl --user disable --now mower-telemetry.service
```

PC의 `stop.ps1`은 이 Jetson 서비스를 종료하지 않는다. PC가 꺼져 있으면 상태 전송 연결은 재시도하고 웹 백엔드도 응답하지 않는다. 상태 모니터와 기존 제어 클라이언트는 같은 MQTT client ID를 사용하므로 동시에 실행하지 않는다. 제어 통합 시험으로 전환할 때는 먼저 모니터의 자동 실행을 해제하고 장비 계정 권한·안전 조건을 별도로 확인한다.

### 기존 제어 클라이언트 실행

colcon으로 빌드한 경우:

```bash
ros2 run jetson_mower_client jetson_mower_client --config edge/jetson-client/config.yaml
```

개발 중에는 Python module로 바로 실행할 수도 있습니다.

```bash
cd edge/jetson-client
python3 -m jetson_mower_client.main --config config.yaml
```

`__main__.py`가 포함되어 있으므로 다음처럼 더 짧게 실행할 수 있다.

```bash
cd edge/jetson-client
python3 -m jetson_mower_client --config config.yaml
```

Jetson에서 반복 실행할 때는 제공된 스크립트를 사용한다. 이 스크립트는 ROS 2 Humble 환경을 source하고 현재 디렉터리를 `PYTHONPATH`에 추가한다.

```bash
cd edge/jetson-client
chmod +x scripts/run-jetson-client.sh
./scripts/run-jetson-client.sh --config config.yaml
```

## 현재 동작

- manual command를 `geometry_msgs/Twist`로 변환해 `/cmd_vel`로 publish
- stop command 수신 시 zero `Twist` publish
- 긴급 정지(E-Stop) 수신 시 즉시 zero `Twist` publish 후 emergency state 진입
- command ack를 `mowers/{robotId}/commands/ack`로 publish
- `/fix`와 `/camera/imu`를 구독하고 telemetry payload에 넣을 수 있도록 최신 sample을 보관
- telemetry/status MQTT publish skeleton 제공

## 아직 구현하지 않은 것

- STM32 serial write. 별도 Jetson bridge node 책임입니다.
- mower attachment 실제 제어. Phase 1에서는 ack와 status skeleton만 둡니다.
- WebRTC camera 송출. `/camera/camera/color/image_raw`와 compressed topic 연동은 이후 phase에서 처리합니다.
- GPS/IMU 값을 이용한 완전한 telemetry 계산. 현재는 구독 skeleton과 payload 자리만 제공합니다.

## 로컬 검증

ROS 2가 없는 개발 PC에서도 순수 Python 모듈 syntax와 command mapping 테스트는 실행할 수 있습니다.

```bash
cd edge/jetson-client
python -m compileall jetson_mower_client tests
python -m unittest discover -s tests
```

## Stop과 E-Stop 하드웨어 출력 차이

Stop과 E-Stop은 의도적으로 다르게 처리한다.

Stop은 일반 정지 명령이다. 다음 topic에 속도 0만 publish한다.

- `/cmd_vel`
  - type: `geometry_msgs/Twist`
  - 값: 속도 0

E-Stop은 Jetson/STM32 하드웨어 브릿지 상태 머신을 위한 안전 비상정지 명령이다. publish 순서는 다음과 같다.

1. `/cmd_vel`
   - type: `geometry_msgs/Twist`
   - 값: 속도 0
2. `/mower/set_mode`
   - type: `std_msgs/Int8`
   - 값: `2`
   - 의미: EMERGENCY mode
3. `/mower/engine`
   - type: `std_msgs/Bool`
   - 값: `false`
   - 의미: 가솔린 엔진 릴레이 강제 차단

E-Stop 이후 client는 로컬 emergency state를 유지하고 일반 명령을 거부한다. 향후 reset-after-emergency 흐름이 추가되더라도 엔진을 자동으로 다시 켜거나 이전 주행/작업 장치 출력을 자동 복구하면 안 된다.

## `/cmd_vel` QoS 설정

`/cmd_vel` publisher는 일반적인 ROS 2 제어 topic과 `ros2 topic echo`에 맞춰 다음 QoS를 기본으로 사용한다.

- history: `keep_last`
- depth: `10`
- durability: `volatile`
- reliability: `reliable`

설정 파일에서 다음 값을 변경할 수 있다.

```yaml
ros:
  cmd_vel_qos_depth: 10
  cmd_vel_qos_durability: volatile
  cmd_vel_qos_reliability: reliable
```

지원 값:

- `cmd_vel_qos_durability`: `volatile`, `transient_local`
- `cmd_vel_qos_reliability`: `reliable`, `best_effort`

다음 경고가 발생하면 publisher와 subscriber의 durability가 서로 맞지 않는 상태이다.

```text
New subscription discovered on topic '/cmd_vel', requesting incompatible QoS.
Last incompatible policy: DURABILITY
```

먼저 Jetson에서 subscriber QoS를 확인한다.

```bash
ros2 topic info /cmd_vel --verbose
```

하드웨어 브릿지 subscriber가 `transient_local`을 요청한다면 일반적인 제어 topic 동작에 맞게 브릿지 subscriber를 `volatile`로 변경하는 것을 우선 권장한다. 브릿지를 즉시 변경할 수 없는 경우에만 `cmd_vel_qos_durability: transient_local`로 publisher 설정을 맞춘다.

`ros2 topic echo`로 확인할 때는 다음처럼 QoS를 명시할 수 있다.

```bash
ros2 topic echo /cmd_vel geometry_msgs/msg/Twist \
  --qos-durability volatile \
  --qos-reliability reliable
```
## AUTO 실행 관리의 PC 준비

검토한 웹 계획의 작업 구역을 r60 무구동 실행기에 넘길 때는 `jetson_mower_client.web_route_plan`의 기존 인자에 `--r60-preview-zone`을 추가한다. 별도 JSON 파일로 구역 ID·버전과 외곽 경계를 내보내며, 내부 제외 구역은 r60 형식에서 지원하지 않아 거부한다. 이 파일을 읽는 r60은 구역 안에서 자체 경로를 계산한다. 웹의 경로점과 진입 경로를 실행기에 적용하는 기능은 별도 연결이 필요하다.

`jetson_mower_client.cpp_auto_preflight`는 HTTPS로 웹에서 검토한 계획을 조회해 기존 경로 검증을 적용하고, r60 무구동 세션의 로컬 구역 JSON과 최근 상태 JSON을 대조한다. 설치 후 `python -m jetson_mower_client.cpp_auto_preflight --help`에서 입력을 확인할 수 있다. 보고서에는 구역 일치와 무구동 입력의 위치·방향·장애물 최신성이 표시된다. 첫 계획이 생긴 상태 메시지에 한해 보고 좌표를 웹 계획의 진입·작업 경로 순서와 비교한다. 좌표 일치와 별도로 실행기의 계획 ID·해시 적용 확인과 현장 제어권 확인이 필요하다.

`jetson_mower_client.r60_preview_runner`는 ROS 환경에서 대화형 터미널 없이 r60 무구동 CPP를 시작한다. 실행 관리자가 넘긴 `MOWER_RUN_ID`를 기준으로 전용 상태·장애물·포즈 토픽을 사용한다. `--planner-dir`에는 r60의 `gps_cpp_planner` 절대 경로를, 마지막 인자에는 구역 JSON 절대 경로를 넣는다. 관측기는 해당 세션의 장애물 토픽에 별도로 연결해야 한다. 이 실행 모드는 경로 계산과 상태 확인용이며 구동 브리지·현장 허용을 시작하지 않는다.

웹 지도에서 무구동 실행을 요청하려면 기존 미리보기 쓰기 설정을 켜고, ROS 환경을 불러온 Jetson에서 `MOWER_PREVIEW_TOKEN`을 설정한 뒤 아래 작업자를 실행한다. 토큰은 시험 서버의 `control:write`와 조회 권한이 필요하다. 지도에서 로봇 제어권을 얻고 **Jetson 남은 경로 → 무구동 시작**을 누른다.

```bash
python3 -m jetson_mower_client.preview_run --api-base-url <HTTPS_API> --robot-id <ROBOT_ID> \
  --planner-dir <CPP_PLANNER_ABSOLUTE_PATH> --model <SEMANTIC_MODEL_ABSOLUTE_PATH> --semantic-lib <SEMANTIC_LIB_ABSOLUTE_PATH>
```

작업자는 저장 구역을 다시 읽어 전용 관측기·CPP·경로 보고기를 실행한다. 요청 만료·종료 또는 서버 접속 실패 시 실행 그룹을 종료하며, 같은 요청을 자동 실행하지 않는다.

기존 `change-mode` 명령의 `parameters.mode=autonomous` 경로에서 `AutonomyExecution`에 실행을 요청한다. 별도 작업 시작 MQTT 토픽은 추가하지 않았다. 실행 프로그램은 장비의 설정 파일 `autonomy.command`에 문자열 목록으로 지정하며, MQTT payload의 실행 파일·명령 문자열은 사용하지 않는다. `shell=False`로 실행하고 실행 파일은 절대 경로만 허용한다. 이 설정은 신뢰할 수 있는 장비 관리자만 수정해야 한다.

예제 설정은 `autonomy.command: []`로 비활성이다. r61을 연결할 때는 `config.yaml.example`의 `--live-ssh-latched` 예시처럼 `{work-zone}` 자리표시자를 정확히 한 번 넣는다. 게이트웨이는 AUTO 요청으로 r61 감독 프로세스를 시작하되, 첫 SSH ping에는 연결 확인만 답하고 `/mower/remote_override`, `/mower/stm32_feedback_status`, `/mower_cpp/drive_status`의 최신 입력과 요청 구역 일치가 확인될 때만 한 번 `r`을 답한다. MQTT 단절·정지·비상 정지는 프로세스 그룹을 종료하며, 연결 복구만으로 다시 `r`을 보내지 않는다.

기존 SSH 시험과 웹 실행은 r61의 `preview_session.sh`가 잡는 동일 사용자 전용 잠금을 공유한다. 이미 한 감독 세션이 있으면 뒤 세션은 STM32 브리지나 시리얼을 열기 전에 거부된다. 잠금은 중복 실행 방지 장치이며 현장의 리모컨·릴레이·독립 정지 수단을 대체하지 않는다.

프로세스 생성 성공은 `accepted / autonomy-process-started`, 상태는 `awaiting-start`다. 웹 AUTO에서 이 응답은 구역 확인을 담당할 자식 프로세스가 시작됐다는 뜻이다. 장비 준비를 확인하고 명령을 발행하는 운영 연결은 아직 적용하지 않았다. 이후 연결 시 `MOWER_WORK_ZONE_API_BASE_URL`과 `WORK_ZONE_API_TOKEN`, `MOWER_MISSION_SPOOL`을 설정한다. 자식은 HTTPS로 최신 구역을 조회하고 요청의 ID·버전과 일치할 때만 작업 폴더에 `requested-work-zone.json`을 저장해 설정된 실행기의 마지막 인자로 넘긴다. 조회 토큰은 실행기에 전달하지 않는다. 기존 r60 대화형 실행기는 SSH 터미널을 요구하므로 웹용 비대화 실행기를 연결해야 한다.

`MOWER_MISSION_SPOOL`이 설정되면 실행 관리자가 자식에게 `MOWER_RUN_ID`와 작업별 `MOWER_PREVIEW_LOG_DIR`를 전달한다. 실제 장비 상태를 확인하는 어댑터는 해당 환경에서 `python -m jetson_mower_client.mission_confirmation <start|end> <ISO_8601_측정시각>`으로 확인 이벤트를 남긴다. 실행 관리자는 작업 UUID와 시각·순서를 확인한 뒤 업로드 대기열에 넣는다. 별도 업로더는 시작·종료를 차례로 보내고 압축 로그를 등록하며, 전송이 실패하면 같은 신호 UUID로 재시도한다.

r60의 STM32 상태는 리모컨 개입과 통신 상태를 제공한다. 궤도·날의 실측 상태를 확인해 이벤트를 발생시키는 어댑터는 미연결이다. `run_end`는 로그 마감에 사용한다. 실제 작업이 확인됐거나 구동 허용 여부가 불명확하면 프로세스 종료 후에도 별도 종료 확인을 기다린다.

웹 AUTO의 시작 프레임 전송 후 실제 작업이 확인되기 전에 감독 실행기를 정지한 경우, 다음 AUTO 요청에서 이전 프로세스 그룹이 사라졌는지 검사한다. 해당 작업의 구역·시각, `run_end`와 `summary.json`이 일치하고 전체 판단에 구동 허용이 없으며 출력 기록이 모두 0일 때만 이전 준비 세션을 정리한다. 확인 파일이나 기록이 모호하면 재요청을 거절한다. 이 절차는 작업 이력이나 물리 정지 확인을 생성하지 않으며, 새 실행은 새 요청의 권한과 장비 준비 조건을 다시 확인한다.

실제 작업의 종료 확인은 이전 실행 프로세스 그룹이 사라지고 같은 작업의 시작·종료 기록이 검증된 뒤 적용한다. 작업 정지를 요청한 뒤에는 그 시점보다 오래된 종료 확인을 거절한다. 어댑터의 시작·종료 확인이 실행기 종료 뒤에 도착해도 작업 UUID와 시각 순서를 확인해 기존 작업을 마감할 수 있다. 현재 r63 브리지의 리모컨 개입·응답 신선도 보고에는 궤도나 칼날의 실측 정지 신호가 없다. 실제 장비 상태를 확인하는 발행자가 연결되기 전에는 웹 정지 ACK나 모터 명령값으로 종료 확인을 생성하지 않는다.

stop, E-Stop과 다른 모드·수동 요청은 관리 중인 프로세스의 종료를 요청한다. MQTT 연결 해제를 감지하면 기존 AUTO 준비를 무효화하고 준비 중이거나 실행 중인 자식도 종료한다. POSIX에서는 별도 프로세스 그룹을 생성해 그룹에 종료 신호를 보내고, Windows 모의 시험에서는 직접 실행한 프로세스를 종료한다. E-Stop의 기존 출력과 로컬 비상 상태 설정은 프로세스 정리보다 먼저 수행한다. 프로세스 종료는 기체·날·현장 리모컨의 물리 정지 확인이 아니다. 실제 통신 단절 응답 시간과 물리 정지는 현장 인터록과 STM32를 포함해 별도로 검증한다.

ROS와 장비 없이 모의 프로그램으로 검사하려면 `requirements.txt`가 설치된 가상 환경에서 다음을 실행한다.

```powershell
$env:PYTHONPATH=(Resolve-Path edge/jetson-client).Path
python -m unittest discover -s edge/jetson-client/tests -p test_autonomy.py -v
```

저장소 루트 기준이다. `tests/fixtures/autonomy_mock.py`는 장비·ROS·MQTT에 접근하지 않고 대기한 뒤 지정 코드로 종료한다. Linux 프로세스 그룹 처리는 테스트 대역으로 확인하며 실제 Jetson의 프로세스·시리얼·중재·정지는 별도 검증 대상이다. 이 코드를 장비에 배포하거나 기존 모니터를 중지하지 않았다.
## 웹 작업 구역의 별도 준비 파일

기존 Jetson의 `mower_test.sh`는 5×5m 시험용 원본으로 보존한다. 새 `scripts/prepare-web-work-zone.sh`와 `jetson_mower_client/web_work_zone.py`는 웹 저장 구역을 별도 JSON으로 준비한다. 주행 스크립트의 복사본이나 자동 출발 실행기가 아니며 ROS·시리얼·카메라·기존 구역 파일을 조작하지 않는다. 실제 다각형 주행 경로와 비전 지도 표시의 연결은 후속 작업이다.

팀원 YOLO의 실험 출력에 대한 내부 해석기는 `jetson_mower_client/vision_observation.py`다. `parse_frame`은 사람의 카메라 좌표 후보와 깊이 없음·잘못된 입력·사람 없음을 구분하며 `parse_status`는 수신된 카메라·비전 시간 초과를 분리한다. `0.1-experimental`과 `camera_color_optical_frame`만 처리하고 촬영 시각은 검증되지 않은 ROS 헤더 값으로 보존한다. ROS 구독과 heartbeat 미수신 감시, GPS 지도 변환·서버 전송·기존 저장 서비스 연결은 없다. 3D 매칭 성공만으로 실제 위치 정확도나 안전을 보증하지 않는다.

필요한 의존성은 별도 가상 환경에서 `python -m pip install -r requirements-work-zone.txt`로 설치한다. 다각형 검증에는 Shapely를 사용하며 Jetson의 Python·시스템 패키지 호환성은 실제 적용 전에 확인한다. 기존 상태 전송 클라이언트만 실행할 때는 기존 `requirements.txt`를 사용한다.

기존 작업 구역 조회 API 응답 파일을 사용하려면 패키지 디렉터리에서 다음과 같이 실행한다.

```bash
python3 -m jetson_mower_client.web_work_zone \
  --response-file /path/to/work-zone-response.json \
  --robot-id '<ROBOT_ID>' --expected-version 3 \
  --output /path/to/web-work-zone-v3.json
```

Linux에서는 `bash scripts/prepare-web-work-zone.sh` 뒤에 같은 인수를 지정해도 된다. 인수의 버전은 사용자가 확인한 실제 웹 구역 버전이다. 파일 입력은 기존 `GET /api/robots/{robotId}/work-zone`의 전체 응답(`success`, `data`) 형식이며 좌표는 GeoJSON 순서 `[경도, 위도]`다. 로봇·구역 ID와 버전, WGS84 Polygon, 닫힌 고리와 자기 교차·내부 제외 구역의 유효성을 확인한다. 도형을 사각형으로 바꾸거나 자동 복구하지 않는다.

서버에서 직접 조회하려면 `--response-file` 대신 `--api-base-url https://<BACKEND_HOST>`를 지정하고 `WORK_ZONE_API_TOKEN` 환경변수에 해당 서버의 `robots:read` 권한이 있는 단기 인증 토큰을 설정한다. 토큰은 명령줄·문서·Git에 넣지 않는다. HTTPS 인증서 검증은 유지하며 리다이렉트는 거부한다. 로그인·토큰 발급·갱신을 이 실행기에서 대신하지 않으며 실제 장비 계정의 인증 방식은 담당자와 정해야 한다.

결과에는 구역 ID·버전·원본 도형·SHA-256과 `status=prepared`를 저장한다. 조회한 시점의 스냅샷이며 이후 웹 변경을 자동 반영하지 않는다. 실제 적용 전 최신 버전과 일치하는지 다시 확인할 계약이 필요하다. 기존 출력 파일과 `boundary.json`이라는 이름은 거부하므로 확인할 새 구역은 새 이름으로 저장한다. POSIX에서는 소유자만 읽는 권한으로 생성하며, 위치 정보의 저장 기간과 파일 접근 권한을 관리해야 한다. 준비 성공은 실제 경로 안전성·GPS 준비 완료·주행 승인·예초 완료를 의미하지 않는다.

검사는 저장소 루트에서 `PYTHONPATH`를 `edge/jetson-client`로 지정하고 `python -m unittest discover -s edge/jetson-client/tests -p test_web_work_zone.py -v`를 실행한다. 구역 처리와 실제 CLI 파일 생성을 PC에서 검사했고 인증 HTTP 조회는 대역 검사다. 실제 서버·Jetson 수신, Linux 셸 래퍼 실행과 주행·비전 표시는 아직 검증하지 않았다.


## 웹에서 확인한 예정 경로의 준비

웹의 예정 경로 생성은 `/api/robots/{robotId}/work-zone/cpp-preview/plans`로 요청하고 서버가 보관한 원본과 같은 경로를 표시한다. 화면에 표시된 경로 ID를 사용한다. 서버는 구역 ID·버전과 경로·격자·계산 프로필을 한 원문에 묶어 V15 `route_plan`에 보관한다. Jetson은 경로를 다시 계산하지 않는다.

`requirements-work-zone.txt`의 의존성을 설치한 Python과 이 저장소의 `PYTHONPATH`를 사용한다. 서버·웹 적용과 인증 토큰 준비는 별도로 필요하다.

```bash
python3 -m jetson_mower_client.web_route_plan \
  --api-base-url https://<API_HOST> --robot-id <ROBOT_ID> \
  --expected-version <ZONE_VERSION> --plan-id <PLAN_ID> \
  --output web-route-<PLAN_ID>.json
```

토큰은 기존 `WORK_ZONE_API_TOKEN` 환경변수로 제공하며 명령에 넣지 않는다. HTTPS 인증서 검증·리다이렉트 거부와 기존 서버의 `robots:read` 권한을 적용한다. 장비 전용 HTTP 인증의 운영 방식은 아직 확정하지 않았다. 오프라인에서는 `--api-base-url` 대신 `--response-file <GET_RESPONSE_JSON>`으로 같은 준비 검사를 실행한다. 오프라인 파일은 서버의 현재 버전을 확인할 수 없다.

조회 API는 로봇과 현재 구역 ID·버전 일치를 확인하고, 준비 코드는 기대 경로 ID·원문 SHA-256·구역과 경로의 식별 정보·좌표·경계와 차체 외접원 여유를 검사한다. 해시는 UTF-8 `payload` 문자열의 바이트를 대상으로 하며 JSON을 다시 직렬화하지 않는다. 해시는 인증을 대신하지 않는다. 성공하면 원문·해시·ID를 `route_prepared` 파일에 그대로 보존하고 터미널에 경로 ID를 출력한다. 기존 파일과 `boundary.json`은 덮어쓰지 않는다.

이번 단계는 파일 준비이며 실제 주행 준비 완료가 아니다. 서버 재시작 뒤에도 보관본은 DB에 남지만 자동 삭제·보관 기간은 아직 정하지 않았다. 빈 경로·한 점짜리 경로는 Jetson 준비에서 거부한다. 준비 후 구역이 변경될 수 있으므로 실제 실행 직전 최신 버전 재확인과 적용 중 변경 정책, 아래 파일 준비 보고와 별개인 장비 전용 준비 확인, AUTO 명령에 경로 ID를 붙이는 연결·작업 시작 신호·실제 추종기는 후속 작업이다. 기존 AUTO 동작이나 5×5 시험 스크립트를 교체하지 않는다. 실제 Jetson 배포·HTTPS 조회·물리 주행은 이번 검증에 포함하지 않았다.


### 파일 준비 보고와 웹 확인

사용자 합의에 따라 기존 HTTPS 로그인 토큰으로 보고한다. 조회에는 `robots:read`, 보고 POST에는 `control:write`가 필요하므로 아래 실행용 토큰에는 두 권한이 필요하다. 이는 준비 프로그램의 주장이고 장비 전용 신원 인증은 아니다. 실제 Jetson 준비·주행 승인이나 AUTO 허가에 사용하지 않는다.

먼저 `web_route_plan`으로 새 준비 파일을 생성한 뒤 같은 로봇·버전·경로 ID로 보고한다.

```bash
python3 -m jetson_mower_client.web_route_report \
  --api-base-url https://<API_HOST> --robot-id <ROBOT_ID> \
  --expected-version <ZONE_VERSION> --plan-id <PLAN_ID> \
  --prepared-file web-route-<PLAN_ID>.json
```

토큰은 `WORK_ZONE_API_TOKEN` 환경변수로만 제공한다. 보고기는 로컬 파일의 원문·해시·식별 정보·경계를 재검사하고 서버 GET으로 최신 구역과 원문을 확인한 뒤 SHA-256만 POST한다. HTTPS와 리다이렉트 거부를 유지한다. 실패해도 준비 파일을 변경하지 않으며 같은 파일로 재시도할 수 있다. 서버는 최초 수신 시각과 인증 계정을 기록하고 중복 보고로 덮어쓰지 않는다.

웹에서 해당 예정 경로를 생성한 뒤 `파일 준비 보고 확인`을 누르면 미수신·확인 실패·파일 준비 보고 수신을 구분해 표시한다. 수신 시각은 한국 시간이다. 자동 조회하지 않으며 재조회 전 표시가 최신임을 보장하지 않는다. 구역·로봇·경로 변경이나 편집·세션 변경 후 기존 확인 결과를 제거하고 늦은 응답을 버린다. 기록은 수신 시점의 보고이며 이후 파일 삭제·프로그램 종료·네트워크 단절을 감지하는 기능은 아니다. AUTO 실행·실제 장비 인증·추종기·주행 검증은 후속 단계다.


## 날 상태 입력 연결 전 팀원 확인 사항

면적 계산의 내부 입력은 `BladeObservation`이며 작업 ID·로봇 ID·신호 ID·실제 측정 시각과 상태 `ON/OFF/UNKNOWN`, 출처 `ROTATION/POWER/UNKNOWN`을 기록한다. `ROTATION`은 회전 관측, `POWER`는 전원/릴레이 관측이며 명령 수락이나 리모컨 스위치 요청을 실제 회전으로 바꾸지 않는다. 출처가 없으면 `UNKNOWN`만 허용한다. 실제 Jetson·STM32 수신기와 공개 쓰기 API·MQTT 토픽은 아직 연결하지 않았다.

팀원에게 본체 스위치와 리모컨 양쪽 조작을 모두 반영하는 신호가 있는지, 실제 회전인지 전원/릴레이 상태인지, 신호 장치·배선도·펌웨어 위치·ROS 타입이나 시리얼 형식·측정 시각·발행 주기와 단절 시 동작을 확인한다. 주기적 상태 관측을 전제로 3초 미수신을 확인 불가로 처리하므로, 변경 때 한 번만 발행한다면 heartbeat 또는 상태 조회를 먼저 설계해야 한다. 임의 재발행 시각으로 오래된 측정을 새 신호처럼 만들지 않는다.

예초 폭은 사용자 제공 0.650m이며 GPS 안테나와 날 중심의 오프셋·방향에 따른 보정, 신호 지연과 측정 시계 정합성은 후속 확인 대상이다. 아래 내용을 팀원에게 전달할 수 있다.

> 본체 스위치와 리모컨으로 날을 켰을 때 모두 반영되는 상태 신호를 찾고 있습니다. 실제 날 회전·전원·릴레이 중 무엇을 나타내는지, 관련 배선도/펌웨어 위치와 Jetson이 읽는 방법·값·주기·실제 측정 시각을 알려주세요. 신호가 없으면 회전 또는 전류 센서로 상태를 관측할 수 있는지도 확인 부탁드립니다. GPS 안테나와 날 중심의 위치 차이도 필요합니다. 기존 시동·날·주행 제어나 펌웨어를 임의로 바꾸려는 작업은 아닙니다.


## 이동 가능 범위와 경로 교체 상태 계약 (2026-11-08)

웹 저장 구역에 travelZone이 있으면 작업 구역 밖에서도 해당 이동 가능 범위 안의 진입 경로를 검토할 수 있다. 진입 경로를 담은 formatVersion=2/hd7000w-transit-v1 원문은 web_route_plan 준비기가 이동 가능 다각형·작업 구역 포함 관계·진입 경로의 차체 여유와 작업 경로 연결점을 검증한다. start는 현재 단계에서 검토용 좌표이며 실측 GPS나 주행 허가가 아니다. 이동 가능 범위 밖이거나 경로를 찾지 못하면 거부한다.

새 `mission.py`는 내부 상태 계약이며 ROS/MQTT/실행기와 아직 연결하지 않았다. 명시적 경로 확인→AUTO 요청→파일 준비→실제 준비 미확인과 실제 시작 확인을 분리한다. 구역 변경은 중단 요청을 발생시키고 해당 실행 ID·중단 요청 ID에 대응하는 실제 정지 확인이 있어야 최신 구역의 경로 재생성 콜백을 호출한다. 새 경로를 생성해도 확인·AUTO 요청을 다시 해야 한다. 명령 ACK·파일 보고·프로세스 종료로 실제 시작/정지 확인을 대신하지 않는다. 운영 어댑터에서 신호 출처·유효 시간·중복과 실행 중/재시작 복구를 확인한 뒤 연결해야 한다.

현재 웹 AUTO는 저장된 작업 구역 ID·버전을 보낸다. Jetson이 최초 경로와 이후 구역 내 경로를 계산하고 웹은 이를 표시하는 방향이다. 위 `mission.py`의 개별 경로 검토 흐름은 이전 내부 시험 계약으로, 웹 AUTO에 연결되지 않았다. 서버는 실제 준비 확인 어댑터가 연결되기 전까지 주행 명령을 발행하지 않는다. 실제 구역 적용, 현장 구동 허용과 해제, 장애물 및 통신 이상으로 인한 정지·재시작 조건은 Jetson 실행 경로에서 별도로 확인한다.
## 웹 수동 시리얼 연결 준비

방향키 시험 코드의 패킷과 같은 `$MODE,LPWM,RPWM,ENG,CS*` 형식을 별도 어댑터로 준비했다. 웹 버튼은 누른 동안만 입력을 반복하고 각 누름과 재개 세대를 구분한다. 첫 장비 시험에는 PWM 편차를 ±100으로 제한했으며, 이후 사용자 요청으로 저장소 코드를 ±400으로 변경했다. 실제 속도와 안전 검증은 별도이며 `ENG=0`은 명령값일 뿐 날의 실제 정지 상태가 아니다.

새 어댑터는 `manual_serial.port`가 없는 기본 설정에서 비활성이다. 시리얼 포트 독점과 실제 포트 식별, 모니터와 제어 클라이언트의 동일 MQTT client ID 충돌, 장비의 명령 구독·ACK 발행 권한을 해결하기 전 설정하거나 기동하지 않는다. 기존 ROS 브리지와 방향키 프로그램을 동시에 같은 포트에 연결하지 않는다. 기동·전환·배포는 장비 담당자와 절차를 확인한다.

기동 이후 새 STM32 중립 진단과 hold 종료를 확인하면 재개를 허용한다. 리모컨 활성 이력은 요구하지 않는다. 최근 진단(`Remote active`와 hold 시간)이 없거나 활성 상태라면 재개를 거부한다. 리모컨 개입, 연결 종료, 시리얼 상태 유실 또는 입력 시간 초과는 이전 재개 세대와 입력을 폐기한다. 입력의 브라우저 발신 시각부터 0.35초를 사용하고 0.1초 주기로 출력한다. 클라이언트와 Jetson의 시계 차이나 스케줄러 지연이 있으면 수동 입력이 거부될 수 있으며 실제 0.5초 이내 정지는 아직 검증하지 않았다. 정상 포인터 해제는 해당 누름을 폐기하고 MANUAL 패킷을 사용한다. 리모컨 개입 후에는 화면의 재개 요청과 장비 ACK가 필요하며 정지된 누름의 늦은 패킷은 거부한다. 진단 시각은 Jetson 수신 시각이며 센서 원본 측정 시각이 아니다.

주기적 진단, 5초 hold와 실제 리모컨 우선 동작은 사용자 제공 펌웨어 및 담당자 확인에 근거한다. 2026-11-09에는 중립 상태의 진단 수신만 확인했다. 실제 리모컨 조작·웹 MQTT 명령·포트 독점·재연결·시계 차이·실제 PWM·물리 정지·전체 E-Stop은 검증하지 않았다. 웹 정지·E-Stop은 현장 리모컨의 구동 차단을 보장하지 않는다. 이 코드는 현장 검증 전 배포하거나 실제 구동에 사용하지 않는다.
