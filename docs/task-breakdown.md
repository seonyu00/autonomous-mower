# 프론트엔드 작업 분해

본 작업 목록은 `docs/frontend-masterplan.md`의 reviewer 검토 결과를 반영한 epics/tasks 단위 계획이다. 아직 프론트엔드 코드는 생성하지 않는다.

## Reviewer 검토 결과

- 안전 기능: E-Stop, 500ms 데드맨 스위치, E-Stop 해제 후 자동 재개 금지, 통신 두절 시 조작 차단이 반드시 별도 epic으로 관리되어야 한다.
- 권한 제어: RBAC는 화면 표시 제어뿐 아니라 명령 발행 모듈에서도 재검증해야 한다. 조회 전용 사용자, 조작 권한 사용자, 상위 관리자 권한을 구분한다.
- 통신 장애 대응: WSS/STOMP 재연결, 3초 텔레메트리 미수신 경고, 수동 조종 중 연결 이상 발생 시 정지 명령 발행, WebRTC 장애 처리 기준을 테스트 대상으로 포함해야 한다.
- 제어권: 한 로봇당 한 명의 수동 조종자만 허용하고, 네트워크 단절/무입력 자동 해제 및 상위 관리자 강제 회수를 UI와 상태 관리에 반영해야 한다.
- 데이터 기능: Polygon 작업 구역, 이력 조회, 로그/스냅샷 조회가 제어 기능보다 늦게 구현되더라도 별도 화면과 API 계약이 필요하다.
- 통신 보안: HTTPS/WSS/MQTTS(TLS 1.2 이상)는 프론트엔드에서 WSS/HTTPS 강제와 프로토콜 인디케이터로 드러나야 한다. MQTTS는 웹 직접 연결이 아니라 서버가 전달하는 엣지 연결 상태로 표시하는 것이 타당하다.
- SRS 충돌 지점: UI 설계 장의 1080p @ 30fps와 N-10의 15fps/480p/500kbps 제한이 다르다. 구현 우선 기준은 N-10이며, 1080p @ 30fps는 추정 확장 옵션으로만 둔다.

## Epic 1. 프로젝트 기반

- Task 1.1: React + TypeScript + Vite 프로젝트 생성.
- Task 1.2: ESLint, Prettier, TypeScript strict 설정.
- Task 1.3: 환경 변수 구조 정의: API base URL, WSS URL, WebRTC signaling URL.
- Task 1.4: AppShell 레이아웃 구현: Header, Sidebar, main content, right status area.
- Task 1.5: 라우팅 구성: Login, Map View, History, Log Viewer, Settings.
- Task 1.6: 공통 UI 컴포넌트 구현: Button, Dialog, StatusBadge, Toast, ErrorBoundary.

## Epic 2. 인증(Auth) 및 RBAC

- Task 2.1: 로그인 REST API 클라이언트 구현.
- Task 2.2: access token 저장/갱신 정책 구현. 세부 방식은 백엔드 계약에 맞춘다.
- Task 2.3: RBAC 타입 정의: read-only, operator, supervisor/admin.
- Task 2.4: `PermissionGate`로 메뉴와 버튼 표시 제어.
- Task 2.5: 명령 발행 모듈에서 RBAC 재검증.
- Task 2.6: 권한 부족, 세션 만료, 인증 실패 UI 처리.

## Epic 3. 로봇 및 텔레메트리(Telemetry) 모니터링

- Task 3.1: 로봇 목록 REST 조회 구현.
- Task 3.2: 선택 로봇 상태 store 구현.
- Task 3.3: WSS/STOMP 클라이언트 구현.
- Task 3.4: 텔레메트리 topic 구독과 store 정규화.
- Task 3.5: 배터리, 현재 모드, 작업 상태, 오류 상태, 좌표, 속도, 통신 상태 패널 구현.
- Task 3.6: 1Hz 상태 갱신 기준 UI 검증.
- Task 3.7: 3초 이상 텔레메트리 미수신 시 통신 두절 경고 표시.
- Task 3.8: MQTT/WSS/HTTPS 프로토콜 인디케이터 구현. MQTT는 백엔드 상태 이벤트 기반으로 표시한다.

## Epic 4. 지도 및 작업 구역(Work Zone)

- Task 4.1: 지도 라이브러리 선정 및 기본 Map View 구현. 후보는 MapLibre GL 또는 Leaflet.
- Task 4.2: 현재 위치 마커와 이동 궤적 표시.
- Task 4.3: Polygon 작업 구역 렌더링.
- Task 4.4: 포인트 입력 기반 작업 구역 생성 UI 구현.
- Task 4.5: Polygon 수정/삭제/저장 흐름 구현.
- Task 4.6: Polygon 유효성 검사: 최소 점 개수, 닫힌 링, 자기 교차 방지.
- Task 4.7: PostGIS `Polygon, 4326`과 호환되는 GeoJSON 변환 모듈 구현.
- Task 4.8: 장애물과 E-Stop 발생 구역 지도 표시.

## Epic 5. 이력, 로그, 스냅샷

- Task 5.1: 날짜/로봇 기준 이력 검색 폼 구현.
- Task 5.2: 과거 이동 궤적 조회 API 클라이언트 구현.
- Task 5.3: History 지도 재생 또는 구간 표시 UI 구현.
- Task 5.4: 작업 이력 목록 구현.
- Task 5.5: 에러 로그 조회 API 클라이언트 구현.
- Task 5.6: 장애물 감지, 통신 단절, E-Stop 이벤트 타임라인 구현.
- Task 5.7: 치명적 오류 스냅샷 JPEG 조회 UI 구현.
- Task 5.8: 로그 severity/filter/search 상태 관리 구현.

## Epic 6. 제어권(Control Lock)

- Task 6.1: 제어권 상태 타입 정의: none, requesting, held, held-by-other, expired, revoked.
- Task 6.2: 제어권 요청/반납 API 클라이언트 구현.
- Task 6.3: 제어권 STOMP topic 구독 및 UI 동기화.
- Task 6.4: 한 로봇당 한 명만 조작 가능한 UI 잠금 구현.
- Task 6.5: 상위 관리자 강제 회수 API와 확인 Dialog 구현.
- Task 6.6: 네트워크 단절/장시간 무입력 자동 해제 상태 반영.
- Task 6.7: 제어권이 없으면 모든 주행/작업장치 명령 차단.

## Epic 7. 수동 제어 및 데드맨 스위치(Deadman Switch)

- Task 7.1: ManualJoystick 컴포넌트 구현.
- Task 7.2: 방향/속도 명령 모델 정의: action, direction, speed, robotId.
- Task 7.3: 조이스틱 명령 송신 모듈 구현. 자동 재시도는 금지한다.
- Task 7.4: 500ms 데드맨 타이머 구현.
- Task 7.5: 500ms 이상 입력 없음 감지 시 속도 0 정지 명령 발행.
- Task 7.6: `pointerup`, `pointercancel`, `blur`, `visibilitychange`, `pagehide`, `beforeunload` 정지 명령 처리.
- Task 7.7: 수동 조종 중 WSS/STOMP 장애 발생 시 정지 명령 시도 및 위험 상태 표시.
- Task 7.8: 데드맨 동작 단위 테스트 작성.

## Epic 8. 모드, 예초 장치, 긴급 정지(E-Stop)

- Task 8.1: AUTO/MANUAL/HOME 모드 전환 UI 구현.
- Task 8.2: 작업 시작/작업 정지 명령 구현.
- Task 8.3: 예초 장치 구동/정지 명령 구현.
- Task 8.4: 작업장치 상승/하강 명령 구현.
- Task 8.5: 전역 E-Stop 버튼 구현.
- Task 8.6: E-Stop 명령 우선 송신 경로 구현.
- Task 8.7: E-Stop 상태에서는 모든 일반 조작 비활성화.
- Task 8.8: E-Stop 해제 후 이전 명령 자동 재개 금지와 대기 상태 UI 구현.
- Task 8.9: E-Stop 접근성 테스트와 Playwright E2E 작성.

## Epic 9. WebRTC 영상

- Task 9.1: 온디맨드 영상 요청/중단 UI 구현.
- Task 9.2: WebRTC signaling 클라이언트 구현. signaling 방식은 백엔드 계약에 맞춘다.
- Task 9.3: ICE 연결 상태와 장애 상태 표시.
- Task 9.4: 화면 이탈, 권한 상실, 스트림 비활성화 시 즉시 중단 요청.
- Task 9.5: 최소 기준 15fps/480p, 최대 500kbps 정책 표시.
- Task 9.6: 네트워크 상태별 품질 저하 표시.
- Task 9.7: 영상 장애와 제어 가능 여부 정책을 백엔드/운영 정책과 정합화.

## Epic 10. 복원력 및 오류 처리

- Task 10.1: REST 오류 표준화: auth, forbidden, validation, network, server.
- Task 10.2: WSS/STOMP 지수 백오프 재연결 구현.
- Task 10.3: 재연결 중 `degraded` 상태 표시.
- Task 10.4: 재연결 중 신규 수동 조종 진입 차단.
- Task 10.5: 명령 실패 Toast와 상세 오류 Dialog 구현.
- Task 10.6: 로봇 통신 두절, 서버 연결 두절, 영상 연결 두절을 구분해 표시.
- Task 10.7: 전역 ErrorBoundary와 복구 액션 구현.

## Epic 11. 테스트 및 검증

- Task 11.1: 단위 테스트: RBAC permission, geometry conversion, reconnect policy.
- Task 11.2: 단위 테스트: 500ms 데드맨 스위치.
- Task 11.3: 단위 테스트: E-Stop 후 자동 재개 금지 상태 전이.
- Task 11.4: 통합 테스트: STOMP telemetry 수신 후 UI 갱신.
- Task 11.5: Playwright: 로그인 및 읽기 전용 사용자 조작 차단.
- Task 11.6: Playwright: Polygon 생성/수정/저장.
- Task 11.7: Playwright: 제어권 요청, 강제 회수, 반납.
- Task 11.8: Playwright: 수동 조종 중 입력 중단 시 정지 명령 발행.
- Task 11.9: Playwright: E-Stop 우선 처리.
- Task 11.10: Playwright: 이력 조회와 로그/스냅샷 조회.

## Epic 12. 전달 및 문서화

- Task 12.1: 프론트엔드 실행/빌드 문서 작성.
- Task 12.2: 백엔드 API 계약 문서 초안 작성.
- Task 12.3: STOMP topic payload 계약 문서 초안 작성.
- Task 12.4: WebRTC signaling 계약 문서 초안 작성.
- Task 12.5: 운영 환경 HTTPS/WSS 설정 체크리스트 작성.
- Task 12.6: 안전 기능 검증 체크리스트 작성.
