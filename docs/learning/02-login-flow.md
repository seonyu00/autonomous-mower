# 로그인 흐름

## 처리 순서

```text
LoginPage
  -> POST /api/auth/login
  -> AuthService
  -> AdminRepository
  -> BCrypt 비밀번호 검증
  -> JwtTokenProvider
  -> accessToken 반환
  -> authStore 저장
```

로그인은 사용자가 누구인지 확인하는 인증(Authentication) 단계다. 이후 API마다 JWT의 역할과 권한을 검사하는 인가(Authorization)가 수행된다.

## 공개용 요청 예제

```http
POST /api/auth/login
Content-Type: application/json

{
  "adminId": "<ADMIN_ID>",
  "password": "<ADMIN_PASSWORD>"
}
```

응답의 실제 토큰을 문서나 로그에 남기지 않는다.

```json
{
  "data": {
    "accessToken": "<JWT_TOKEN>",
    "tokenType": "Bearer",
    "user": {
      "id": "<ADMIN_ID>",
      "role": "operator"
    }
  }
}
```

보호된 API에는 다음 헤더가 필요하다.

```http
Authorization: Bearer <JWT_TOKEN>
```

## 읽을 파일

1. `frontend/src/features/auth/api.ts`
2. `frontend/src/features/auth/authStore.ts`
3. `backend/src/main/java/com/autonomousmower/auth/controller/AuthController.java`
4. `backend/src/main/java/com/autonomousmower/auth/service/AuthService.java`
5. `backend/src/main/java/com/autonomousmower/auth/security/JwtTokenProvider.java`

현재 프론트엔드 route 자체를 막는 명확한 인증 guard는 부족하다. 하지만 백엔드 API는 JWT가 없거나 유효하지 않으면 요청을 거부한다.
