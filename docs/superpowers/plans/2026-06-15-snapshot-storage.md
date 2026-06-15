# 스냅샷 저장·조회 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WebRTC 현재 프레임을 JPEG로 저장하고 수동 로그와 연결해 로그 뷰어에서 조회한다.

**Architecture:** 브라우저가 현재 `<video>` 프레임을 JPEG Blob으로 만들고 Spring Boot multipart API에 업로드한다. 백엔드는 JPEG를 로컬 파일 저장소에 기록하고 `robot_snapshot` 메타데이터와 `robot_event`를 연결하며, 인증된 binary 조회 API를 제공한다.

**Tech Stack:** React 19, TypeScript, Canvas API, Spring Boot 3.3, Java 21, JPA, Flyway, PostgreSQL, Vitest, JUnit 5, Mockito

---

## 실행 결과

- 상태: 코드 구현과 자동 검증 완료, 실제 영상 프레임 통합 검증 차단
- 완료:
  - `robot_snapshot` 스키마, 이벤트 참조와 로컬 JPEG 저장소
  - JPEG 검증, multipart 업로드, 인증된 binary 조회
  - 수동 로그 생성과 로그 응답의 스냅샷 참조
  - Canvas 프레임 캡처, 업로드 상태와 Blob 미리보기
  - 명시적 로그 Mock 설정과 실제 로그 검색 날짜 계약
  - 백엔드 테스트 70개, 프론트 테스트 95개, 린트와 production build
- 계획 대비 조정:
  - `snapshotCapture.ts` 대신 역할이 분명한 `captureVideoFrame.ts` 이름을 사용했다.
  - multipart와 Blob HTTP 계약은 별도 API 테스트 파일 대신 공용 `httpClient.test.ts`에서 검증했다.
  - 버튼 비활성화는 브라우저 실화면에서 확인했고, 캡처 로직과 상태 저장은 순수 함수·store 테스트로 검증했다.
- 차단:
  - 원격 MediaMTX `100.92.7.56:8889`가 응답하지 않아 실제 영상 프레임 캡처, DB 행과 파일 생성, 로그 JPEG 재조회는 남아 있다.

### Task 1: 스냅샷 스키마와 도메인 모델

**Files:**
- Create: `backend/src/main/resources/db/migration/V7__create_robot_snapshot.sql`
- Create: `backend/src/main/java/com/autonomousmower/logs/entity/RobotSnapshot.java`
- Create: `backend/src/main/java/com/autonomousmower/logs/repository/RobotSnapshotRepository.java`
- Modify: `backend/src/main/java/com/autonomousmower/logs/entity/RobotEvent.java`
- Test: `backend/src/test/java/com/autonomousmower/domain/RepositoryContractTest.java`

- [ ] `robot_snapshot`과 `robot_event.snapshot_id` 계약을 검증하는 repository 테스트를 먼저 추가한다.
- [ ] 해당 테스트만 실행해 스키마와 엔티티 부재로 실패하는지 확인한다.
- [ ] migration, entity, repository와 `RobotEvent.attachSnapshot()`을 최소 구현한다.
- [ ] repository 테스트를 다시 실행해 통과를 확인한다.

### Task 2: 로컬 JPEG 저장소

**Files:**
- Create: `backend/src/main/java/com/autonomousmower/logs/config/SnapshotStorageProperties.java`
- Create: `backend/src/main/java/com/autonomousmower/logs/service/SnapshotFileStorage.java`
- Create: `backend/src/main/java/com/autonomousmower/logs/model/StoredSnapshotFile.java`
- Modify: `backend/src/main/resources/application.yml`
- Modify: `.env.example`
- Modify: `.gitignore`
- Test: `backend/src/test/java/com/autonomousmower/logs/service/SnapshotFileStorageTest.java`

- [ ] 임시 디렉터리에서 JPEG 저장, 조회, 삭제와 경로 탈출 방지를 검증하는 실패 테스트를 작성한다.
- [ ] 테스트를 실행해 저장소 클래스 부재로 실패하는지 확인한다.
- [ ] `{robotId}/{yyyy}/{MM}/{dd}/{snapshotId}.jpg` 경로와 원자적 이동을 구현한다.
- [ ] 기본 저장 경로 `data/snapshots/`를 Git 추적에서 제외한다.
- [ ] 저장소 테스트를 실행해 통과를 확인한다.

### Task 3: 업로드 서비스와 수동 로그 생성

**Files:**
- Create: `backend/src/main/java/com/autonomousmower/logs/service/SnapshotService.java`
- Create: `backend/src/main/java/com/autonomousmower/logs/dto/SaveSnapshotResponse.java`
- Modify: `backend/src/main/java/com/autonomousmower/common/exception/ErrorCode.java`
- Test: `backend/src/test/java/com/autonomousmower/logs/service/SnapshotServiceTest.java`

- [ ] JPEG 저장 시 `robot_snapshot`과 `manual-snapshot` 이벤트가 연결되는 실패 테스트를 작성한다.
- [ ] JPEG가 아닌 파일, 빈 파일과 크기 초과가 거부되는 테스트를 작성한다.
- [ ] DB 저장 실패 시 저장 파일을 삭제하는 테스트를 작성한다.
- [ ] 테스트를 실행해 실패를 확인한다.
- [ ] `SnapshotService.saveManualSnapshot()`과 `loadSnapshot()`을 최소 구현한다.
- [ ] 서비스 테스트를 실행해 통과를 확인한다.

### Task 4: multipart 업로드와 binary 조회 API

**Files:**
- Create: `backend/src/main/java/com/autonomousmower/logs/controller/SnapshotController.java`
- Modify: `backend/src/main/java/com/autonomousmower/logs/controller/LogController.java`
- Test: `backend/src/test/java/com/autonomousmower/logs/controller/SnapshotControllerTest.java`

- [ ] `POST /api/robots/{robotId}/snapshots` multipart 계약과 권한 테스트를 작성한다.
- [ ] `GET /api/logs/snapshots/{snapshotId}` JPEG 응답과 권한·404 테스트를 작성한다.
- [ ] 컨트롤러 테스트를 실행해 endpoint 부재로 실패하는지 확인한다.
- [ ] 업로드는 `telemetry:read`, 조회는 `logs:read` 권한으로 구현한다.
- [ ] 컨트롤러 테스트를 실행해 통과를 확인한다.

### Task 5: 로그 응답에 스냅샷 참조 연결

**Files:**
- Modify: `backend/src/main/java/com/autonomousmower/logs/service/LogService.java`
- Modify: `backend/src/test/java/com/autonomousmower/logs/service/LogServiceTest.java`

- [ ] 연결된 snapshot이 `SnapshotResponse`로 변환되는 실패 테스트를 작성한다.
- [ ] 테스트를 실행해 현재 `snapshot=null` 동작을 확인한다.
- [ ] `LogService.toResponse()`가 ID, 시각, content type과 조회 URL을 반환하도록 구현한다.
- [ ] 로그 서비스 테스트를 실행해 통과를 확인한다.

### Task 6: 브라우저 프레임 JPEG 캡처와 업로드 client

**Files:**
- Create: `frontend/src/features/video/snapshotCapture.ts`
- Create: `frontend/src/features/video/snapshotApi.ts`
- Test: `frontend/src/features/video/snapshotCapture.test.ts`
- Test: `frontend/src/features/video/snapshotApi.test.ts`

- [ ] video 크기 검증과 Canvas JPEG Blob 생성을 검증하는 실패 테스트를 작성한다.
- [ ] multipart의 `file`, `captureType`, `capturedAt` 필드를 검증하는 실패 테스트를 작성한다.
- [ ] 테스트를 실행해 모듈 부재로 실패하는지 확인한다.
- [ ] `captureVideoFrame()`과 `uploadManualSnapshot()`을 구현한다.
- [ ] 관련 테스트를 실행해 통과를 확인한다.

### Task 7: VideoPanel 수동 캡처 상태

**Files:**
- Modify: `frontend/src/features/video/types.ts`
- Modify: `frontend/src/features/video/videoStore.ts`
- Modify: `frontend/src/features/video/components/VideoPanel.tsx`
- Modify: `frontend/src/features/video/videoStore.test.ts`
- Create: `frontend/src/features/video/components/VideoPanel.test.tsx`

- [ ] 미연결·프레임 없음 상태의 버튼 비활성화 테스트를 작성한다.
- [ ] 저장 성공 시 `saved`, 실패 시 `failed` 상태와 한국어 메시지를 검증한다.
- [ ] 테스트를 실행해 현재 placeholder 동작 때문에 실패하는지 확인한다.
- [ ] placeholder `requestSnapshot()`을 실제 업로드 상태 전이로 교체한다.
- [ ] VideoPanel 관련 테스트를 실행해 통과를 확인한다.

### Task 8: 실제 로그 API와 JPEG 미리보기

**Files:**
- Modify: `frontend/src/features/logs/types.ts`
- Modify: `frontend/src/features/logs/api.ts`
- Modify: `frontend/src/features/logs/components/SnapshotViewer.tsx`
- Modify: `frontend/src/pages/LogViewerPage.tsx`
- Create: `frontend/src/features/logs/components/SnapshotViewer.test.tsx`
- Create: `frontend/src/features/logs/api.test.ts`

- [ ] 실제 모드 로그 조회와 인증된 snapshot binary 조회 테스트를 작성한다.
- [ ] 이미지 표시와 조회 실패 시 누락 메시지 테스트를 작성한다.
- [ ] 테스트를 실행해 placeholder 렌더링 때문에 실패하는지 확인한다.
- [ ] `SnapshotViewer`가 인증된 Blob URL을 생성·해제하도록 구현한다.
- [ ] 개발 mock 여부를 명시적 환경변수로 분리하고 실제 로그 API 흐름을 연결한다.
- [ ] 관련 테스트를 실행해 통과를 확인한다.

### Task 9: 문서와 전체 검증

**Files:**
- Modify: `docs/project-inventory.md`
- Modify: `docs/development-log.md`
- Modify: `docs/learning/12-development-roadmap.md`
- Modify: `docs/learning/11-jetson-camera-video-flow.md`

- [ ] 백엔드 전체 테스트를 실행한다: `cd backend; .\gradlew.bat test`
- [ ] 프론트 전체 테스트를 실행한다: `cd frontend; npm run test`
- [ ] 프론트 린트를 실행한다: `cd frontend; npm run lint`
- [ ] production build를 실행한다: `cd frontend; npm run build`
- [ ] 실제 브라우저에서 스트림 연결, 수동 캡처, 로그 검색과 JPEG 조회를 확인한다.
- [ ] DB의 snapshot-event 연결과 파일 저장 경로를 확인한다.
- [ ] 재현 가능한 실패가 발견되면 `.local-docs/failure-learning.md`를 갱신한다.
- [ ] 인벤토리에는 현재 구현 상태, 개발 로그에는 검증 결과, 로드맵에는 후속 Jetson 자동 캡처를 기록한다.
