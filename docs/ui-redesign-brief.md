# 예초기 관제 UI 디자인 기준

## 현재 합의된 방향 — 2026-10-04

사용자가 확인한 밝은형 목업을 기준으로 흰 패널, 옅은 회색 배경, 짙은 녹색 강조를 사용한다. 상단은 간결한 장비 상태 요약, 본문은 지도와 우측 영상·이벤트, 하단은 작업 제어로 구성한다. 긴급 정지는 스크롤 중에도 접근할 수 있도록 공통 헤더에 배치하며 기존 확인 절차와 권한 조건을 유지한다.

모바일에서는 장비 목록을 선택 상자로 바꾸고 상태 요약을 두 열로 정리한다. 실제 지도와 영상은 기존 연동을 사용하며, 초기화 실패·미수신·샘플 모드를 명시한다. 목업에 포함된 생성 위성사진이나 카메라 사진을 실제 운용 데이터 대신 넣지 않는다.

아래 기능 목록은 디자인 검토 항목이다. 데이터 계약에 없는 진행률·잔여 시간·영상 지연 등을 외형을 맞추기 위해 추가하지 않으며, 구현·검증 여부는 `project-inventory.md`와 `development-log.md`를 기준으로 확인한다.

## Goal

현재 화면은 기능은 갖췄지만 카드형 박스가 반복되어 데모 UI처럼 보인다.
목표는 “AI가 만든 사이버 대시보드”가 아니라 “실제 현장 장비 관제용 Fleet Operations Console”이다.

참고 방향:
- Industrial HMI
- Fleet monitoring dashboard
- SCADA/HMI control room UI
- Map-based operations console
- OpenBridge-style restrained industrial interface

피해야 할 방향:
- 네온/글로우 중심의 사이버 HUD
- Dribbble식 과한 목업
- 모든 영역이 같은 카드로 반복되는 레이아웃
- 의미 없는 장식용 데이터
- placeholder처럼 보이는 카메라/지도 패널

## Visual Principles

1. 전체 배경은 밝은형 유지
2. 초록색은 “정상/활성/완료”에만 사용
3. 파란색은 “예정 경로/정보”에 사용
4. 노란색은 “주의/확인 필요”에 사용
5. 빨간색은 “위험/정지/비상”에만 사용
6. 카드 배경은 2~3단계 명도만 사용하고 과한 테두리 제거
7. 그림자/글로우/그라데이션 최소화
8. 텍스트 크기 체계를 명확히 사용

## Layout Direction

현재처럼 화면 전체가 동일한 박스 모음처럼 보이지 않게 한다.

우선순위:
1. 중앙 지도: 가장 중요한 작업 현황
2. 오른쪽 패널: 장비 상태, 영상, 이벤트
3. 하단 패널: 조작 흐름
4. 왼쪽 패널: 내비게이션과 장비 목록

중앙 지도는 넓게 유지하되, 빈 공간이 커 보이지 않도록 실제 운용 정보를 오버레이한다.

## Map Area Requirements

지도에는 다음 정보를 표시한다.

- 작업 구역 polygon
- 예정 경로
- 완료 경로
- 현재 로봇 위치
- 로봇 진행 방향
- 작업 진행률
- 작업 구역 면적
- 현재 heading
- GPS 상태
- 세션 시간
- 예상 남은 시간

지도 오버레이는 장식용 HUD처럼 만들지 말고, 작은 operational info chip/card 형태로 정리한다.

## Right Panel Requirements

오른쪽 패널은 단순 카드 나열이 아니라 “관제자가 계속 보는 상태판”처럼 구성한다.

카메라:
- LIVE 상태
- robot id
- resolution
- fps
- latency
- recording state
- last frame time
- 영상 미수신 empty state

장비 상태:
- battery
- mode
- work state
- control ownership
- GPS/RTK quality
- communication latency
- blade state
- motor state
- Jetson state
- last telemetry time

이벤트:
- severity badge
- timestamp
- message
- suggested action
- acknowledge/details button

## Bottom Control Panel Requirements

하단 제어 패널은 단순 버튼 배열이 아니라 조작 흐름 중심으로 재구성한다.

순서:
1. 현재 운용 상태
2. 제어권 상태
3. 모드 선택
4. 작업 제어
5. 수동 개입
6. 비상 정지는 공통 헤더에서 항상 접근 가능하게 배치

각 버튼은 상태를 가져야 한다.

상태:
- default
- active
- disabled
- pending
- warning
- danger

사용 불가능한 버튼은 이유를 짧게 표시한다.

## Component Rules

모든 컴포넌트는 같은 박스 스타일을 복붙하지 않는다.

- StatusSummary: 숫자 중심
- OperationCard: 현재 상태 중심
- ControlGroup: 조작 흐름 중심
- AlarmList: 이벤트 중심
- TelemetryGrid: compact key-value 중심
- MapOverlay: 지도 위 작은 정보 중심

## Implementation Scope

기능 구조는 유지한다.
우선 CSS, layout, component markup 중심으로 수정한다.
기존 API·실시간 연동과 제어 조건을 유지한다. Mock 환경에서 외형을 확인할 때는 샘플 표시를 유지하고, 실제 프레임이나 측정되지 않은 장비 정보를 수신된 데이터처럼 표현하지 않는다.
