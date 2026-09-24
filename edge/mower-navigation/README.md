# 예초기 경로 생성 모듈

받은 `mower_gps/mower_web/mower_ws/src/mower_map`의 C++17 소스, ROS 패키지 설정과 테스트를 가져왔다. 원본 출처는 `package.xml`에도 보존했다. 원본의 라이선스 선언은 아직 TODO 상태다.

현재는 **PC 경로점 생성과 웹 예정 경로 미리보기용**이다. 웹 백엔드에서 CLI를 호출하며 MQTT, ROS 경로 추종기와 STM32에는 연결하지 않았다. 생성 결과는 실기체 주행 승인이나 안전한 이동 경로를 의미하지 않는다. 구역 밖 격자점을 제외하지만 점 사이의 경계 통과, 장애물 우회, 기체 폭과 회전 반경은 보장하지 않는다.

## PC에서 검증

Python 3와 C++17을 지원하는 `g++`가 필요하다. 저장소 루트에서 실행한다.

```powershell
python edge/mower-navigation/scripts/verify_offline.py
```

컴파일러가 PATH에 없으면 `--cxx C:/mingw64/bin/g++.exe`처럼 지정한다. 임시 폴더에서 두 C++ 테스트와 CLI의 위경도 정밀도 테스트를 실행하고 종료 시 빌드 파일을 정리한다. 시리얼 포트, MQTT와 ROS에는 접속하지 않는다.

## 포함 범위

- `src/mower_map`: GPS 경계 다각형과 격자 크기를 받아 경로점을 생성하는 라이브러리 및 JSON CLI.
- `scripts/verify_offline.py`: ROS 설치 없이 실행하는 빌드·테스트 진입점.
- 원본 `CMakeLists.txt`와 `package.xml`: 향후 Jetson의 colcon 빌드를 위한 설정. 이번 Windows 검증은 CMake/colcon을 사용하지 않는다.

CLI 입력은 `polygon: [{lat, lon}, ...]`, `cell_size_m`, 선택적인 `obstacles`이며 출력은 `rows`, `columns`, `origin`, `path`다. RTK 경계 측정·보정 상태 확인과 파일 전달은 아직 구현하지 않았다.

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

프런트엔드는 `VITE_ENABLE_MOCK_WORK_ZONE=false`로 실행하고 작업 지도에서 저장 구역을 불러온 다음 `예정 경로 생성`을 누른다. 기본 격자 간격은 미리보기용 1m이며 기체 폭 설정이 아니다. 자세한 API, 제한과 검증 범위는 [작업 구역 흐름](../../docs/learning/07-work-zone-postgis.md#cpp-예정-경로-미리보기)을 따른다.
