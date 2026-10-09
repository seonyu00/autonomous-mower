# 제어권 코드 흐름

## 1. 이 기능이 하는 일

제어권(Control Lock)은 한 로봇을 여러 운영자가 동시에 조작하지 못하게 한다. 제어권 소유자만 일반 명령을 보낼 수 있고, `control:takeover` 권한 사용자는 기존 소유권을 강제로 인수할 수 있다.

## 2. 전체 시퀀스

```text
ControlPanel.handleAction()
  -> controlApi.claimControl() / releaseControl() / takeoverControl()
  -> POST /api/control/<ROBOT_ID>/{claim|release|takeover}
  -> ControlController
  -> ControlLockService
  -> ControlStateStore.MutableControlState
  -> ControlLockSnapshot
  -> RealtimePublisher.publishControlLock()
  -> ControlEventPublisher.publishAccepted()
  <- ControlCommandResponse
  -> controlStore 갱신
```

## 3. 프론트엔드 처리

`ControlPanel`은 현재 사용자와 선택한 로봇 상태를 보고 버튼 활성 여부를 결정한다. 실제 요청 함수는 `controlApi.ts`에 있다.

- `claimControl()`은 `requestedMode: manual`을 보낸다.
- `releaseControl()`은 현재 소유권 해제를 요청한다.
- `takeoverControl()`은 프론트엔드에서 먼저 `control:takeover` 권한을 검사한다.
- 응답은 `applyBackendControlResult()`를 거쳐 Zustand `controlStore`에 반영된다. 일반 명령과 반납은 현재 `lockVersion`을 보내며 명시된 수동 명령 버전은 보존한다. HTTP 응답에 현재 `lockVersion`이 포함되고, 현재 저장된 버전보다 오래된 HTTP·STOMP 스냅샷은 무시한다.

프론트엔드 검사는 사용자 경험을 위한 사전 차단일 뿐이다. 실제 권한 판단은 백엔드가 다시 수행한다.

## 4. 백엔드 상태 모델

`ControlStateStore`는 `robotId`별 `MutableControlState`를 `ConcurrentHashMap`에 보관한다. 각 상태 변경 함수는 `synchronized`다.

주요 필드:

- `lockState`: `available` 또는 `held`
- `controlOwner`, `controlOwnerName`
- `mode`, `emergency`
- `lockVersion`
- `expiresAt`
- `reason`, `updatedAt`

`claim()`, `release()`, `takeover()`가 성공할 때마다 `lockVersion`이 증가한다. 기본 TTL은 5분이다.

## 5. 실제 응답 규칙

| 상황 | 결과 |
|---|---|
| 잠금이 비어 있음 | claim 성공 |
| 다른 operator가 보유 | HTTP 423 |
| operator가 takeover 시도 | HTTP 403 |
| supervisor/admin takeover | 성공 |
| 이전 소유자가 release 시도 | HTTP 423 |

실제 로컬 실험에서도 이 순서대로 동작했다.

## 6. 현재 제한과 영향

- 상태가 메모리에만 있어 서버 재시작 시 사라진다.
- 백엔드가 여러 대이면 인스턴스별 제어권이 서로 다를 수 있다.
- TTL 만료는 `snapshot()` 등 상태 접근 시 평가된다. 만료 시각에 맞춘 별도 scheduler와 STOMP broadcast는 없다.
- 일반 명령을 보내도 제어권 TTL은 연장되지 않는다.
- 2026-09-15 작업 8-2에서 일반 명령·반납의 버전 검사를 추가했다. 불일치는 HTTP 409 `CONTROL_VERSION_CONFLICT`이며 인증·소유권·긴급 상태 오류는 기존 검사를 따른다. 같은 로봇 상태의 모니터를 잡은 채 소유권·버전 확인, 상태 갱신, MQTT 발행 호출을 처리하므로 강제 회수가 이 사이에 끼어들지 못한다. 강제 회수가 먼저 완료된 이전 버전 명령은 발행 전에 거부한다. 반대로 명령 허용·발행이 먼저 완료됐으면 강제 회수가 이를 소급 취소하지 않는다.
- 발행 호출을 잠금 안에서 수행하므로 해당 호출이 지연되면 같은 로봇의 강제 회수도 대기한다. 이는 현재 동기 발행 경로의 제한이며 분산 제어권이나 장비 측 fencing을 구현한 것이 아니다.
- 현재 control-lock 메시지는 `realtimeHandlers`와 `applyLockSnapshot()`으로 전달된다. 기존의 빈 handler 설명은 현재 코드와 달라 정정했다.
- 가짜 MQTT 발행 계층의 이전 버전 거부·강제 회수 경쟁·동일 로봇 모니터 검사와 프론트 버전 전달·오래된 응답 무시 회귀 테스트를 작성했다. 작업 8 통합 검증에서 프론트 55개·백엔드 55개와 TypeScript·프론트 빌드·ESLint·bootJar가 통과했다. 가짜 전송을 사용했으며 실제 명령 발행은 하지 않았다.
- 하드웨어·MQTT·STM32 계약은 변경하지 않는다. 이미 발행된 명령의 장비 측 취소, 서버 재시작을 넘는 버전 세대, 실행 완료 응답은 미구현이며 팀원 협의가 필요하다. 접수 응답을 실제 실행 완료로 해석하지 않는다.

## 7. 디버깅 방법

2026-10-06 전용 서버·MQTT·DB 검사에서 실제 동시 claim은 성공 1건/423 1건이었다. supervisor의 회수 이후 이전 소유자는 423, 새 소유자의 오래된 버전 명령·반납은 409였고 거부된 명령의 MQTT 발행은 없었다. 실제 STOMP 제어권 이벤트와 Mock을 끈 브라우저의 요청·반납도 확인했다. 재실행 조건은 [Edge 검증 도구](../../tools/edge-mock-client/README.md#제어ack구역-저장-통합-검증)를 따른다. 이 결과는 한 서버의 검증이며 다중 서버 제어권 공유와 장비 측 이미 수신된 명령 취소를 증명하지 않는다.

1. 서로 다른 역할의 계정 두 개로 claim을 순서대로 호출한다.
2. HTTP 423과 403을 구분한다.
3. 응답의 `controlOwner`, `lockVersion`, `expiresAt`을 확인한다.
4. STOMP `/control-lock` frame이 발행되는지 확인한다.
5. 화면 store가 frame 수신 후 바뀌는지 확인한다.
6. 서버 재시작 후 상태가 사라지는 현재 특성을 확인한다.

## 8. 권장 파일 읽기 순서

1. `frontend/src/features/control/ControlPanel.tsx`
2. `frontend/src/features/control/controlApi.ts`
3. `backend/src/main/java/com/autonomousmower/control/controller/ControlController.java`
4. `backend/src/main/java/com/autonomousmower/control/service/ControlLockService.java`
5. `backend/src/main/java/com/autonomousmower/control/model/ControlStateStore.java`
6. `backend/src/main/java/com/autonomousmower/control/service/ControlRealtimeMapper.java`

## 작업 8 공통 제한

받은 하드웨어 코드와 MQTT·STM32 계약은 변경하지 않는다.
현재 장비가 보내지 않는 실행 완료 응답을 만들어내지 않는다.
계약 변경이 필요한 부분은 미구현으로 구분하고 팀원 협의 항목으로 남긴다.
2026-09-15 검증은 실제 명령 발행 없이 가짜 전송 계층을 사용했다. 2026-10-06에는 실장비와 분리된 전용 PC 브로커에만 명령을 발행했다.
