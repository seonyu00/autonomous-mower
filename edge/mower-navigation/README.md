# 예초기 경로 생성 모듈

받은 `mower_gps/mower_web/mower_ws/src/mower_map`의 C++17 소스, ROS 패키지 설정과 테스트를 가져왔다. 원본 출처는 `package.xml`에도 보존했다. 원본의 라이선스 선언은 아직 TODO 상태다.

현재는 **PC 경로점 생성과 웹 예정 경로 미리보기용**이다. 웹 백엔드에서 CLI를 호출하며 MQTT, ROS 경로 추종기와 STM32에는 연결하지 않았다. 사각형으로 변환하지 않고 오목한 외곽과 내부 제외 구역을 반영한다. 경로점은 차체 여유를 확보한 인접 격자로 연결하고, 연결할 수 없는 영역이 있으면 실패한다. 서버도 반환 경로선 전체를 저장 다각형으로 재검사한다. 제공된 차체 제원은 반영했지만 실기체 주행 승인이나 안전한 이동 경로를 의미하지 않으며 장착 오프셋·추가 안전 여유·실제 회전·위치 오차는 별도 검증이 필요하다.

## PC에서 검증

Python 3와 C++17을 지원하는 `g++`가 필요하다. 저장소 루트에서 실행한다.

```powershell
python edge/mower-navigation/scripts/verify_offline.py
```

컴파일러가 PATH에 없으면 `--cxx C:/mingw64/bin/g++.exe`처럼 지정한다. 임시 폴더에서 두 C++ 테스트와 CLI 계약 테스트를 실행하고 종료 시 빌드 파일을 정리한다. 오목한 U자 경계, 내부 구멍, 고리 방향 반전, 격자보다 얇은 홈, 연결 불가능한 통로와 위경도 정밀도를 검사한다. 시리얼 포트, MQTT와 ROS에는 접속하지 않는다.

## 포함 범위

- `src/mower_map`: GPS 경계 다각형과 격자 크기를 받아 경로점을 생성하는 라이브러리 및 JSON CLI.
- `scripts/verify_offline.py`: ROS 설치 없이 실행하는 빌드·테스트 진입점.
- 원본 `CMakeLists.txt`와 `package.xml`: 향후 Jetson의 colcon 빌드를 위한 설정. 이번 Windows 검증은 CMake/colcon을 사용하지 않는다.

CLI 입력은 외곽 `polygon: [{lat, lon}, ...]`, `cell_size_m`, 선택적인 점 장애물 `obstacles`와 내부 고리 목록 `holes: [[{lat, lon}, ...], ...]`이며 출력은 `rows`, `columns`, `origin`, `path`다. 열린 고리와 닫힌 고리를 받으며 전체 고리의 닫는 점을 제외한 꼭짓점 합계는 최대 500개, 격자는 최대 100,000개다. 내부 제외 구역을 누락시키거나 사각형으로 자동 보정하지 않는다. 작은 구역에서 유효 경로점이 없으면 빈 경로를 반환하고, 차체·격자 여유 때문에 이동 가능 영역이 분리되면 CLI가 실패한다. RTK 경계 측정·보정 상태 확인과 실제 주행 연결은 아직 구현하지 않았다.

### HD-7000W 제원 반영

사용자가 제공한 길이 1.150m·폭 1.030m·높이 0.600m·예초 폭 0.650m를 `include/mower_map/hd7000w_spec.hpp`에 보존한다. 제조사 문서 대조나 현장 실측 결과로 취급하지 않는다. 2D 경로점은 차체 기하 중심으로 해석하며 모든 방향의 차체 모서리를 감싸는 반경 `hypot(1.150, 1.030) / 2 ≈ 0.772m`를 사용한다. 모든 경로점·연결선·중간점 축약 후 선분이 외곽·내부 고리·점 장애물에서 이 반경보다 멀리 떨어지도록 검사한다. 격자 배치에도 이 반경을 올림한 보수적 여유를 적용하므로 좁은 통로와 경계 근처의 일부 영역은 제외될 수 있다.

왕복 줄 간격은 `floor(0.650 / cell_size_m) × cell_size_m`이며 예초 폭보다 커지지 않는다. 기본 0.2m 격자에서는 0.6m 간격이다. 웹·API는 0.2~0.65m를 허용하고 CLI도 예초 폭보다 큰 격자를 거부한다. 예초 폭은 원형 날의 중심이 차체 중심인 기하 모델에만 사용하며 `placeMower`의 Cut 표시는 도형 시뮬레이션이다. 실제 날의 작동이나 예초 완료 면적·커버리지를 뜻하지 않는다. 높이는 2D 경계 계산에 쓰지 않으며 입체 장애물, GPS·날 장착 위치, 위치 오차·추가 안전 여유·실제 회전 궤적은 아직 미검증이다.

받은 웹 전체, 장비별 설정, STM32 펌웨어와 자동 출발하는 원본 추종기는 복사하지 않았다. 후속 작업 순서와 장비 확인 조건은 [개발 로드맵](../../docs/learning/12-development-roadmap.md), 현재 구현 위치는 [프로젝트 인벤토리](../../docs/project-inventory.md)를 따른다.

## 웹 미리보기용 실행 파일

저장소 루트에서 검증에 통과한 CLI를 지정 위치에 보관한다. 기본 검증은 이전처럼 임시 파일만 사용한다.

```powershell
python edge/mower-navigation/scripts/verify_offline.py --output C:/Users/tjsdb/autonomous-mower/backend/build/cpp/cpp_map_cli.exe
$env:CPP_EXECUTABLE='C:\Users\tjsdb\autonomous-mower\backend\build\cpp\cpp_map_cli.exe'
$env:JAVA_HOME='C:\Users\tjsdb\.jdks\ms-21.0.7'
cd backend
.\gradlew.bat bootRun
```

위 경로는 이 PC의 예시이며 다른 PC에서는 저장소와 Java 21 설치 경로로 바꾼다. 기존 DB·JWT 환경변수가 필요하다. MinGW 동적 라이브러리가 필요하면 컴파일러의 `bin` 디렉터리가 서버 프로세스의 PATH에 있어야 한다. Linux에서는 해당 서버에서 빌드한 CLI의 절대 경로를 지정한다. `backend/build`는 clean 시 삭제되므로 이후 다시 빌드한다. Docker 이미지에 CLI를 자동 포함하는 배포 변경은 이번 범위가 아니다.

2026-11-07의 내부 고리 전달 변경을 적용할 때는 서버와 CLI를 같은 소스로 함께 빌드한다. 이전 CLI는 새 `holes` 입력을 지원하지 않으므로 서버 실행 파일만 교체해서는 안 된다.

프런트엔드는 `VITE_ENABLE_MOCK_WORK_ZONE=false`로 실행하고 작업 지도에서 저장 구역을 불러온 다음 `예정 경로 생성`을 누른다. 기본 격자 간격은 0.2m이며 기체 폭은 별도 HD-7000W 제원을 사용한다. 자세한 API, 제한과 검증 범위는 [작업 구역 흐름](../../docs/learning/07-work-zone-postgis.md#cpp-예정-경로-미리보기)을 따른다.
