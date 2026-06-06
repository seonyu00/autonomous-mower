# 자율주행 예초기 학습 자료

이 폴더는 코드를 처음 접하는 사람이 시스템의 전체 흐름부터 기능별 구현 상태까지 순서대로 학습할 수 있도록 정리한 공개용 문서 모음이다.

문서의 명령과 메시지에서 다음 placeholder를 사용한다.

| Placeholder | 의미 |
|---|---|
| `<ADMIN_ID>` | 관리자 계정 ID |
| `<ADMIN_PASSWORD>` | 관리자 비밀번호 |
| `<JWT_TOKEN>` | 로그인 후 발급받은 JWT |
| `<ROBOT_ID>` | 대상 로봇 ID |
| `<DB_USERNAME>` | PostgreSQL 사용자 이름 |
| `<DB_PASSWORD>` | PostgreSQL 비밀번호 |
| `<JWT_SECRET>` | JWT 서명 비밀값 |

실제 비밀번호, 토큰, 장비 식별자, 외부 접속 주소는 문서나 Git 커밋에 포함하지 않는다.

## 권장 학습 순서

1. [전체 시스템 구조](01-system-overview.md)
2. [로그인 흐름](02-login-flow.md)
3. [텔레메트리 흐름](03-telemetry-flow.md)
4. [제어권 흐름](04-control-lock-flow.md)
5. [수동 조종과 데드맨 스위치](05-manual-control-deadman.md)
6. [긴급 정지](06-emergency-stop.md)
7. [작업 구역과 PostGIS](07-work-zone-postgis.md)
8. [MQTT ACK lifecycle](08-mqtt-ack-lifecycle.md)
9. [로컬 실행과 디버깅](09-local-run-debugging.md)
10. [구현 상태와 실제 장비 연동 전 점검](10-implementation-status.md)

상세한 프로젝트 입문 설명은 [`docs/ONBOARDING.md`](../ONBOARDING.md), 현재 코드 기준 인벤토리는 [`docs/project-inventory.md`](../project-inventory.md)를 함께 참고한다.
