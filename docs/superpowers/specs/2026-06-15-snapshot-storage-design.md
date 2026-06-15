# 스냅샷 저장·조회 설계

## 1. 목표

관제 화면의 실시간 WebRTC 영상에서 사용자가 현재 프레임을 JPEG로 캡처하고, 백엔드 로컬 파일 저장소와 PostgreSQL 메타데이터에 저장한 뒤 로그 뷰어에서 다시 조회한다.

이번 범위는 수동 캡처를 완성하되, 향후 Jetson이 장애물·충돌·치명적 오류 발생 시 전송하는 자동 스냅샷도 같은 저장 모델과 조회 API를 재사용할 수 있도록 한다.

## 2. 범위

포함:

- 연결된 WebRTC `<video>` 프레임의 브라우저 JPEG 캡처
- 인증된 multipart 업로드
- JPEG 로컬 파일 저장
- `robot_snapshot` 메타데이터 저장
- `manual-snapshot` 로그 생성
- 로그 API의 스냅샷 참조 반환
- 인증된 JPEG 조회
- 로그 뷰어 JPEG 미리보기
- 파일 누락과 잘못된 업로드의 사용자용 오류 처리

제외:

- Jetson 장애물·오류 자동 캡처 구현
- 객체 스토리지와 CDN
- 장기 보관, 자동 삭제와 보존 기간 정책
- 여러 장의 이미지를 하나의 이벤트에 연결하는 기능
- 영상 녹화

## 3. 데이터 모델

### `robot_snapshot`

| 필드 | 의미 |
|---|---|
| `snapshot_id` | 서버가 생성한 UUID 문자열 |
| `robot_id` | 캡처 대상 로봇 |
| `capture_type` | `manual` 또는 `event` |
| `captured_at` | 캡처 시각 |
| `content_type` | 이번 범위에서는 `image/jpeg` |
| `file_size` | 저장된 JPEG 바이트 수 |
| `relative_path` | 저장 루트 아래 서버 생성 상대 경로 |
| `created_at` | 서버 저장 시각 |

`robot_event.snapshot_id`는 nullable 외래 키로 `robot_snapshot`을 참조한다. 수동 캡처는 새 `RobotEvent`를 함께 만들고 자동 캡처는 향후 기존 이벤트에 연결한다.

## 4. API 계약

### 수동 스냅샷 업로드

```http
POST /api/robots/{robotId}/snapshots
Content-Type: multipart/form-data
Authorization: Bearer <JWT_TOKEN>
```

폼 필드:

- `file`: JPEG binary
- `captureType`: `manual`
- `capturedAt`: ISO 8601 시각

권한은 `telemetry:read`를 사용한다. 현재 영상 시청 권한과 동일하게 유지해 별도 권한 추가를 피한다.

응답:

```json
{
  "snapshotId": "uuid",
  "robotId": "MOWER-01",
  "captureType": "manual",
  "capturedAt": "2026-06-15T12:00:00Z",
  "contentType": "image/jpeg",
  "fileSize": 12345,
  "url": "/api/logs/snapshots/uuid"
}
```

### 스냅샷 조회

```http
GET /api/logs/snapshots/{snapshotId}
Authorization: Bearer <JWT_TOKEN>
```

`logs:read` 권한이 필요하며 `Content-Type: image/jpeg` binary를 반환한다.

## 5. 저장 흐름

1. `VideoPanel`은 연결된 영상과 유효한 `videoWidth`, `videoHeight`가 있을 때만 캡처를 허용한다.
2. Canvas에 현재 프레임을 그리고 JPEG `Blob`을 생성한다.
3. 프론트는 multipart 요청으로 JPEG와 캡처 메타데이터를 전송한다.
4. 백엔드는 로봇, 캡처 유형, content type, 파일 크기를 검증한다.
5. 저장 서비스는 서버가 생성한 상대 경로에 임시 파일을 쓴 뒤 최종 파일명으로 이동한다.
6. 트랜잭션에서 `robot_snapshot`과 `manual-snapshot` 이벤트를 저장한다.
7. DB 저장이 실패하면 생성한 최종 파일을 삭제한다.
8. 로그 조회는 이벤트와 연결된 스냅샷 참조를 반환한다.

## 6. 파일 저장 정책

- 저장 루트: 환경변수 `SNAPSHOT_STORAGE_PATH`, 기본값 `./data/snapshots`
- 파일 경로: `{robotId}/{yyyy}/{MM}/{dd}/{snapshotId}.jpg`
- 실제 경로는 정규화 후 저장 루트 내부인지 확인한다.
- 원본 파일명은 사용하지 않는다.
- JPEG 최대 크기는 환경변수 `SNAPSHOT_MAX_BYTES`, 기본값 5MB로 제한한다.
- Git 추적 대상에는 저장 이미지를 포함하지 않는다.

## 7. 오류 처리

- 영상 미연결 또는 프레임 크기 0: 프론트에서 캡처 차단
- Canvas JPEG 생성 실패: “현재 영상 프레임을 캡처하지 못했습니다.”
- 빈 파일, JPEG 이외 content type, 크기 초과, 잘못된 capture type: HTTP 400
- 알 수 없는 로봇: HTTP 404
- 스냅샷 메타데이터 또는 파일 없음: HTTP 404
- 파일 쓰기 실패: HTTP 500, DB 저장 없음
- DB 저장 실패: 작성한 파일 삭제 후 HTTP 500
- 로그에는 메타데이터가 있지만 파일이 사라진 경우 로그는 유지하고 이미지 영역에 누락 메시지를 표시

## 8. 프론트 상태

기존 placeholder 상태를 다음으로 교체한다.

- `idle`: 캡처 전
- `uploading`: JPEG 생성 또는 업로드 중
- `saved`: 저장 완료, 스냅샷 참조 보관
- `failed`: 사용자용 오류 표시

스냅샷 버튼은 영상 연결, 실제 `MediaStream`, 권한, 업로드 중 여부를 함께 검사한다.

## 9. 테스트

백엔드:

- JPEG 저장과 메타데이터 생성
- 수동 로그와 스냅샷 연결
- content type, 빈 파일, 크기 제한 거부
- 경로가 저장 루트를 벗어나지 않음
- 파일 조회와 404
- 조회·업로드 권한
- DB 실패 시 파일 정리

프론트:

- 연결 전 버튼 비활성화
- video frame을 JPEG Blob으로 변환
- multipart 업로드 계약
- 저장 성공과 실패 상태
- 로그 스냅샷 이미지 렌더링
- 이미지 조회 실패 시 누락 메시지

## 10. 후속 자동 캡처 계약

Jetson 자동 캡처는 별도 단계에서 `captureType=event`와 관련 이벤트 ID를 포함해 같은 백엔드 저장 서비스를 호출한다. MQTT JSON에 JPEG base64를 넣지 않고 HTTP multipart 업로드를 사용한다. MQTT 이벤트에는 이벤트 ID와 상태 정보만 전송해 대용량 binary가 broker 흐름을 막지 않도록 한다.
