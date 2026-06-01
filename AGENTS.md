# Project Context

이 프로젝트는 자율주행 예초기 관제 시스템이다.

구성:
- Jetson Orin
- STM32
- MQTT
- Spring Boot
- PostgreSQL/PostGIS
- React Dashboard

작업 전 반드시:
1. SRS.md 확인
2. docs/* 확인
3. 기존 코드 구조 분석

추정하지 말고 문서 근거를 우선한다.

# Project Development Rules

## Language

- 모든 문서(.md)는 한국어로 작성한다.
- README, docs, 설계 문서, 개발 로그는 한국어를 기본으로 한다.
- 사용자에게 표시되는 UI 문구는 한국어를 기본으로 한다.
- Git 커밋 메시지는 한국어를 기본으로 한다.

## Code

- 코드 식별자(class, function, variable, package)는 영어로 유지한다.
- API path, MQTT topic, 환경변수 이름은 영어로 유지한다.
- 코드 주석은 한국어를 우선 사용한다.
- TODO 주석도 한국어로 작성한다.

## Documentation

- 신규 문서는 한국어로 작성한다.
- 기술 용어는 필요 시 영어 병기:
  - 제어권(Control Lock)
  - 긴급 정지(E-Stop)
  - 데드맨 스위치(Deadman Switch)
  - 텔레메트리(Telemetry)

## Response Style

- Codex는 설명, 계획, 리뷰 결과를 한국어로 작성한다.
- 코드 변경 요약도 한국어로 작성한다.

## Writing Style

- 설명은 자연스러운 한국어 문장으로 작성한다.
- 기계 번역체나 항목 나열만 하지 않는다.
- "구현 내용:", "변경 사항:"만 반복하지 않는다.
- 무엇을 왜 수정했는지 함께 설명한다.
- 리뷰 결과는 단순 지적보다 영향도와 이유를 설명한다.
- 개발 로그는 팀원이 읽는다는 가정으로 작성한다.

좋은 예:

"이번 작업에서는 MQTT ACK lifecycle을 추가했습니다.
이전에는 명령이 실제로 수행되었는지 추적할 수 없었지만,
이제 SENT → ACKED → COMPLETED 흐름을 확인할 수 있습니다."

좋지 않은 예:

"구현 내용:
- ACK lifecycle 추가
- 상태 추가
- 테스트 추가"

## Code Comments

- 주석은 자연스러운 한국어로 작성한다.
- 단순 번역보다 의도와 이유를 설명한다.

좋은 예:
// 비상 정지 상태에서는 일반 제어 명령을 허용하지 않는다.

좋지 않은 예:
// emergency state check

## Review Style

- High/Medium/Low Findings 형식은 유지한다.
- 각 항목마다 문제 원인과 영향도를 설명한다.
- 수정했다면 왜 수정했는지 설명한다.