package com.autonomousmower.control.entity;

public enum CommandExecutionStatus {
    PREPARED,
    SENT,
    ACKED,
    EXECUTING,
    COMPLETED,
    FAILED,
    TIMED_OUT
}
