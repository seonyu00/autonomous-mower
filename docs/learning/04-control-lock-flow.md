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
- 응답은 `applyControlResponse()`를 거쳐 Zustand `controlStore`에 반영된다.

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
- 프론트엔드는 많은 요청에서 `lockVersion: 0`을 보내며 백엔드도 요청 version을 실제 동시성 검사에 사용하지 않는다.
- `RealtimeProvider`의 control-lock handler가 빈 함수라 다른 사용자의 인수 결과가 화면에 즉시 반영되지 않는다.

## 7. 디버깅 방법

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
