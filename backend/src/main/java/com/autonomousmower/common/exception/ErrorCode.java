package com.autonomousmower.common.exception;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
    CPP_GRID_TOO_LARGE(HttpStatus.UNPROCESSABLE_ENTITY, "CPP_GRID_TOO_LARGE", "구역 크기에 비해 격자가 큽니다. 격자 간격을 줄이세요."),
    CPP_INPUT_INVALID(HttpStatus.BAD_REQUEST, "CPP_INPUT_INVALID", "미리보기 입력을 확인하세요. 구멍 없는 구역, 최대 500개 꼭짓점과 10만 격자, 격자 간격 0.2~5m를 지원합니다."),
    CPP_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "CPP_UNAVAILABLE", "서버에 CPP 실행 파일이 설정되지 않았습니다."),
    CPP_BUSY(HttpStatus.SERVICE_UNAVAILABLE, "CPP_BUSY", "다른 경로를 생성 중입니다. 잠시 후 다시 시도하세요."),
    CPP_FAILED(HttpStatus.BAD_GATEWAY, "CPP_FAILED", "CPP 경로 생성에 실패했습니다. 구역 크기와 서버 실행 환경을 확인하세요."),
    CPP_TIMEOUT(HttpStatus.GATEWAY_TIMEOUT, "CPP_TIMEOUT", "CPP 경로 생성 제한 시간을 초과했습니다."),
    CPP_OUTPUT_INVALID(HttpStatus.BAD_GATEWAY, "CPP_OUTPUT_INVALID", "CPP 결과 형식 또는 출력 크기가 허용 범위를 벗어났습니다."),
    WORK_ZONE_CONFLICT(HttpStatus.CONFLICT, "WORK_ZONE_CONFLICT", "작업 구역이 변경되었습니다. 최신 구역을 다시 불러오세요."),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Unexpected server error."),
    INVALID_REQUEST(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Request validation failed."),
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Invalid admin id or password."),
    RESOURCE_NOT_FOUND(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "Requested resource was not found."),
    ROBOT_NOT_FOUND(HttpStatus.NOT_FOUND, "ROBOT_NOT_FOUND", "Robot was not found."),
    SNAPSHOT_NOT_FOUND(HttpStatus.NOT_FOUND, "SNAPSHOT_NOT_FOUND", "Snapshot was not found."),
    INVALID_SNAPSHOT(HttpStatus.BAD_REQUEST, "INVALID_SNAPSHOT", "Snapshot file is invalid."),
    WORK_ZONE_NOT_FOUND(HttpStatus.NOT_FOUND, "WORK_ZONE_NOT_FOUND", "Work zone was not found."),
    CONTROL_LOCK_NOT_HELD(HttpStatus.CONFLICT, "CONTROL_LOCK_NOT_HELD", "Control lock is not held by the requester."),
    CONTROL_OWNED_BY_OTHER_USER(HttpStatus.LOCKED, "CONTROL_OWNED_BY_OTHER_USER", "Control is owned by another user."),
    ROBOT_IN_EMERGENCY(HttpStatus.CONFLICT, "ROBOT_IN_EMERGENCY", "Robot is in emergency state."),
    ROBOT_NOT_IN_EMERGENCY(HttpStatus.CONFLICT, "ROBOT_NOT_IN_EMERGENCY", "Robot is not in emergency state.");

    private final HttpStatus status;
    private final String code;
    private final String message;

    ErrorCode(HttpStatus status, String code, String message) {
        this.status = status;
        this.code = code;
        this.message = message;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    public String getMessage() {
        return message;
    }
}
