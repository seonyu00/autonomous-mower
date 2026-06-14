# Autonomous Mower UI Redesign Brief

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

1. 전체 배경은 다크 테마 유지
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
6. 비상 정지

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
실제 API 연동은 하지 않고 mock 데이터로 표현해도 된다.

다만 mock 데이터도 실제 장비 데이터처럼 보여야 한다.
예: GPS 정확도, latency, blade state, motor state, telemetry age, session elapsed time.