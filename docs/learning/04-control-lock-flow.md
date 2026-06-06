# 제어권 흐름

제어권(Control Lock)은 여러 사용자가 같은 로봇을 동시에 조작하지 못하게 하는 서버 측 잠금이다.

## 처리 순서

```text
React
  -> POST /api/control/<ROBOT_ID>/claim
  -> ControlController
  -> ControlLockService
  -> ControlStateStore
  -> 잠금 소유자와 만료 시각 반환
  -> STOMP control-lock 발행
```

일반 운영자가 이미 잠긴 로봇을 다시 획득하면 `423 Locked`가 반환된다. `control:takeover` 권한이 있는 supervisor 또는 admin은 강제 인수할 수 있다.

## 요청 예제

```http
POST /api/control/<ROBOT_ID>/claim
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "idempotencyKey": "claim-example-001",
  "requestedMode": "manual"
}
```

## 현재 제한

- 잠금 상태는 `ConcurrentHashMap` 기반의 프로세스 메모리에 있다.
- 서버 재시작 시 잠금이 사라진다.
- 백엔드가 여러 대이면 인스턴스 사이에 잠금이 공유되지 않는다.
- 만료는 상태를 다시 조회하거나 사용할 때 평가되며 만료 전용 broadcast 작업은 없다.
- 프론트엔드가 보내는 `lockVersion`과 백엔드 검증이 완전히 연결되지 않았다.

실제 운영 환경에서는 DB 또는 분산 저장소를 사용하고, 잠금 갱신과 만료 권한을 하나의 안전 주체가 관리해야 한다.
