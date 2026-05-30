package com.autonomousmower.control.entity;

public enum CommandExecutionStatus {
    SENT,
    ACKED,
    EXECUTING,
    COMPLETED,
    FAILED,
    TIMED_OUT
}
