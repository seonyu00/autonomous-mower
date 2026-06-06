# 상세 코드 흐름 학습 문서 설계

## 목적

기존 `docs/learning/`의 개요 문서를 실제 코드를 따라갈 수 있는 상세 해설서로 확장한다. 공개 저장소에는 placeholder와 마스킹된 검증 결과만 기록하고, 환경별 실행 원본은 Git에서 제외되는 `.local-docs/`에 분리한다.

## 공개 문서

`docs/learning/`의 로그인, 텔레메트리, 제어권, 수동 조종과 데드맨 스위치, 긴급 정지, 작업 구역, MQTT ACK 문서를 보강한다.

각 기능 문서는 다음 순서를 따른다.

1. 비개발자를 위한 기능 설명
2. 시스템 시퀀스
3. 프론트엔드 진입점과 함수 호출 순서
4. 백엔드 Controller, Service, Repository 처리 순서
5. MQTT topic, QoS, payload
6. Jetson과 ROS 2 처리
7. 데이터베이스 저장 내용
8. 마스킹한 실제 검증 결과
9. 현재 구현 문제와 안전상 영향
10. 디버깅 절차와 권장 파일 읽기 순서

공개 예제는 `<ADMIN_ID>`, `<JWT_TOKEN>`, `<ROBOT_ID>` 같은 placeholder를 사용한다. 실제 토큰, 비밀번호, 사용자 경로, 외부 주소는 기록하지 않는다.

## 로컬 문서

`.local-docs/`에는 다음 파일을 둔다.

- `README.md`: 로컬 문서의 목적과 보안 규칙
- `integration-test-results.md`: 기능별 실행 결과와 확인 시각
- `observed-api-responses.md`: 마스킹한 HTTP 상태와 응답 구조
- `mqtt-message-traces.md`: 명령과 ACK의 관찰 순서
- `database-verification.md`: 텔레메트리, 작업 구역, 명령 상태 확인 결과

로컬 문서도 실제 비밀번호와 JWT 전체 문자열은 저장하지 않는다. 공개 문서에 부적합한 환경별 로봇 ID, 포트 충돌, 실행 프로세스 정보 정도만 보관한다.

## 기존 문서와 관계

- `docs/ONBOARDING.md`는 전체 입문서 역할을 유지한다.
- `docs/learning/README.md`는 상세 해설의 목차가 된다.
- `docs/project-inventory.md`는 구현 상태의 기준 문서로 유지한다.
- `.understand-anything/`은 자동 생성 분석 자료로 계속 Git에서 제외한다.

## 검증 기준

- 공개 문서의 코드 경로와 클래스·함수 이름이 현재 저장소에 존재한다.
- 기능별 시퀀스가 실제 호출 방향과 일치한다.
- 앞서 수행한 로컬 실험 결과와 문서 설명이 모순되지 않는다.
- Markdown 상대 링크가 유효하다.
- 공개 변경분에 실제 secret, 개인 경로, 사설 IP가 없다.
- `.local-docs/`, `.understand-anything/`, 사용자 변경인 `AGENTS.md`는 공개 문서 커밋에 포함되지 않는다.
