# 로그인 코드 흐름

## 1. 이 기능이 하는 일

로그인은 입력한 관리자 ID와 비밀번호를 백엔드에서 검증하고, 이후 요청에 사용할 JWT를 발급하는 과정이다. 로그인 성공은 제어 권한을 모두 얻었다는 뜻이 아니다. JWT에 포함된 역할과 권한을 각 API가 다시 검사한다.

## 2. 전체 시퀀스

```text
사용자
  -> LoginPage.handleLogin()
  -> auth/api.login()
  -> POST /api/auth/login
  -> AuthController.login()
  -> AuthService.login()
  -> AdminRepository.findById()
  -> PasswordEncoder.matches()
  -> JwtTokenProvider.createToken()
  <- LoginResponse
  -> authStore.setSession()
  -> /map 이동
```

## 3. 프론트엔드 처리

진입점은 `frontend/src/pages/LoginPage.tsx`다.

1. `adminId`, `password`, `error`를 React state로 관리한다.
2. form submit이 `handleLogin()`을 호출한다.
3. `frontend/src/features/auth/api.ts`의 `login()`이 HTTP 요청을 보낸다.
4. 성공하면 `useAuthStore.setSession(user, accessToken)`으로 사용자와 JWT를 저장한다.
5. 인증 상태가 참이 되면 `<Navigate to="/map">`가 실행된다.
6. `RequireAuth`가 `/map`, `/history`, `/logs`, `/settings` 접근 전에 인증 상태를 확인한다.
7. 보호 API가 401을 반환하면 `httpClient`가 저장된 세션을 해제하고 route guard가 `/login`으로 이동시킨다.

개발 설정에서 `VITE_ENABLE_MOCK_AUTH=true`이면 실제 API 대신 Mock 로그인을 사용할 수 있다. 실제 인증을 확인할 때는 반드시 이 값을 `false`로 둔다.

## 4. 백엔드 처리

`AuthController.login()`은 요청을 `AuthService.login()`에 전달한다. 서비스는 다음 순서로 처리한다.

1. `AdminRepository`에서 `adminId`에 해당하는 계정을 찾는다.
2. 저장된 BCrypt 해시와 입력 비밀번호를 비교한다.
3. 역할에 대응하는 권한을 가진 `SecurityUser`를 만든다.
4. `JwtTokenProvider.createToken()`이 subject, role, permissions, 만료 시각을 담은 JWT를 생성한다.
5. 토큰과 사용자 정보를 `LoginResponse`로 반환한다.

이후 REST 요청은 `JwtAuthenticationFilter`가 `Authorization` 헤더를 읽고 Spring Security의 `SecurityContext`를 설정한다.

## 5. 공개용 요청 예제

```http
POST /api/auth/login
Content-Type: application/json

{
  "adminId": "<ADMIN_ID>",
  "password": "<ADMIN_PASSWORD>"
}
```

```json
{
  "data": {
    "accessToken": "<JWT_TOKEN>",
    "tokenType": "Bearer",
    "expiresAt": "2026-01-01T01:00:00Z",
    "user": {
      "id": "<ADMIN_ID>",
      "role": "operator",
      "permissions": ["control:write", "telemetry:read"]
    }
  }
}
```

보호된 API에는 다음 헤더가 필요하다.

```http
Authorization: Bearer <JWT_TOKEN>
```

## 6. 실제 검증에서 확인한 내용

- 유효한 계정으로 로그인하면 HTTP 200과 JWT가 반환됐다.
- 발급받은 JWT로 제어권 API를 호출할 수 있었다.
- `operator`는 일반 제어가 가능하지만 강제 인수에는 실패했다.
- `supervisor`는 `control:takeover` 권한으로 강제 인수할 수 있었다.

실제 계정 ID, 비밀번호, JWT 원문은 공개 문서에 기록하지 않는다.

## 7. 현재 문제

- HTTP client가 백엔드 오류 envelope의 상세 메시지를 충분히 전달하지 않아 UI에는 상태 코드 중심의 오류만 보일 수 있다.
- refresh token과 자동 토큰 갱신 정책은 구현되지 않았다.
- 프론트는 앱 시작 시 JWT 만료 시각을 선제 검사하지 않는다. 보호 API의 401 응답을 받은 시점에 세션을 해제한다.

## 8. 디버깅 방법

1. 브라우저 Network 탭에서 `/api/auth/login`의 상태 코드를 확인한다.
2. 요청 body에 빈 값이 들어가지 않았는지 확인한다.
3. 백엔드에서 계정 조회와 비밀번호 검증 실패 로그를 확인한다.
4. 성공 응답의 JWT는 원문을 공유하지 말고 payload claim만 로컬에서 확인한다.
5. 보호 API가 401이면 Authorization 헤더, 403이면 역할·권한을 확인한다.
6. 헤더에 사용자가 표시되지만 API가 401이면 `sessionStorage`에 만료된 세션이 남아 있었는지 확인한다.

## 9. 권장 파일 읽기 순서

1. `frontend/src/pages/LoginPage.tsx`
2. `frontend/src/features/auth/api.ts`
3. `frontend/src/features/auth/authStore.ts`
4. `frontend/src/app/RequireAuth.tsx`
5. `frontend/src/shared/api/httpClient.ts`
6. `backend/src/main/java/com/autonomousmower/auth/controller/AuthController.java`
7. `backend/src/main/java/com/autonomousmower/auth/service/AuthService.java`
6. `backend/src/main/java/com/autonomousmower/auth/security/JwtTokenProvider.java`
7. `backend/src/main/java/com/autonomousmower/auth/security/JwtAuthenticationFilter.java`
