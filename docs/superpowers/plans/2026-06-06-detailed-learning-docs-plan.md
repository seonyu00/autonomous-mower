# 상세 코드 흐름 학습 문서 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 코드와 실제 로컬 검증 결과를 근거로 기능별 상세 공개 해설서와 Git 제외 로컬 기록을 작성한다.

**Architecture:** `docs/learning/`에는 placeholder와 마스킹된 결과만 포함한 공개 해설을 두고, `.local-docs/`에는 환경별 실행 관찰 기록을 둔다. 기존 입문서와 구현 인벤토리는 유지하고 상세 문서에서 링크한다.

**Tech Stack:** Markdown, React/TypeScript, Spring Boot/Java, MQTT, Python/ROS 2, PostgreSQL/PostGIS, Git

---

### Task 1: 코드 흐름 근거 수집

**Files:**
- Read: `frontend/src/`
- Read: `backend/src/main/java/`
- Read: `edge/jetson-client/jetson_mower_client/`
- Read: `.understand-anything/knowledge-graph.json`

- [ ] 핵심 클래스와 함수 이름을 기능별로 검색한다.
- [ ] Controller, Service, MQTT, Jetson, DB 호출 순서를 기존 실험 결과와 대조한다.
- [ ] 문서에 사용할 정확한 API path, topic, QoS를 확인한다.

### Task 2: 공개 상세 해설 작성

**Files:**
- Modify: `docs/learning/02-login-flow.md`
- Modify: `docs/learning/03-telemetry-flow.md`
- Modify: `docs/learning/04-control-lock-flow.md`
- Modify: `docs/learning/05-manual-control-deadman.md`
- Modify: `docs/learning/06-emergency-stop.md`
- Modify: `docs/learning/07-work-zone-postgis.md`
- Modify: `docs/learning/08-mqtt-ack-lifecycle.md`
- Modify: `docs/learning/README.md`

- [ ] 기능 설명과 상세 시퀀스를 작성한다.
- [ ] 프론트엔드, 백엔드, MQTT, Jetson, DB 처리 순서를 기록한다.
- [ ] 마스킹된 실제 검증 결과와 현재 문제의 영향을 기록한다.
- [ ] 디버깅 절차와 권장 파일 읽기 순서를 기록한다.

### Task 3: 로컬 전용 기록 작성

**Files:**
- Create: `.local-docs/README.md`
- Create: `.local-docs/integration-test-results.md`
- Create: `.local-docs/observed-api-responses.md`
- Create: `.local-docs/mqtt-message-traces.md`
- Create: `.local-docs/database-verification.md`

- [ ] 앞서 수행한 로그인, 텔레메트리, 제어권, 데드맨, E-Stop, 작업 구역, ACK 실험 결과를 기록한다.
- [ ] 실제 JWT와 비밀번호는 기록하지 않는다.
- [ ] 환경별 포트와 관찰 결과를 공개 문서와 분리한다.

### Task 4: 검증과 공개

**Files:**
- Verify: `docs/learning/*.md`
- Verify: `.local-docs/*.md`
- Verify: `.gitignore`

- [ ] Markdown 상대 링크와 문서에 적힌 코드 경로의 존재 여부를 검사한다.
- [ ] 실제 secret, 개인 경로, 사설 IP가 공개 변경분에 없는지 검사한다.
- [ ] `.local-docs/`, `.understand-anything/`, `AGENTS.md`가 staged 변경에 포함되지 않는지 확인한다.
- [ ] 공개 문서만 한국어 커밋 메시지로 커밋하고 `origin/main`에 푸시한다.
