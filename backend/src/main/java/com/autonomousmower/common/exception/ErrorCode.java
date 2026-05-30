package com.autonomousmower.common.exception;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Unexpected server error."),
    INVALID_REQUEST(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Request validation failed."),
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Invalid admin id or password."),
    RESOURCE_NOT_FOUND(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "Requested resource was not found."),
    ROBOT_NOT_FOUND(HttpStatus.NOT_FOUND, "ROBOT_NOT_FOUND", "Robot was not found."),
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
