package com.autonomousmower.logs.controller;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.autonomousmower.common.exception.GlobalExceptionHandler;
import com.autonomousmower.logs.repository.RobotEventRepository;
import com.autonomousmower.logs.service.LogService;
import com.autonomousmower.robot.service.RobotService;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class LogControllerTest {
    private final RobotEventRepository repository = mock(RobotEventRepository.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(
            new LogController(new LogService(mock(RobotService.class), repository)))
            .setControllerAdvice(new GlobalExceptionHandler()).build();

    @Test
    void reversedDatesReturnInvalidRequestWithoutQueryingDatabase() throws Exception {
        mvc.perform(get("/api/logs")
                        .param("from", "2026-06-16T00:00:00Z")
                        .param("to", "2026-06-15T00:00:00Z"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("INVALID_REQUEST"));
        verifyNoInteractions(repository);
    }

    @Test
    void allRobotDatesAreConvertedToUtcAndCombinedWithOtherFilters() throws Exception {
        mvc.perform(get("/api/logs")
                        .param("from", "2026-06-15T09:00:00+09:00")
                        .param("to", "2026-06-15T23:59:59.999Z")
                        .param("severity", "critical").param("text", "edge"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").isArray());
        verify(repository).findInDateRange(null, "critical",
                LocalDateTime.parse("2026-06-15T00:00:00"),
                LocalDateTime.parse("2026-06-15T23:59:59.999"));
    }

    @Test
    void missingStartRemainsAnOpenUtcBoundary() throws Exception {
        mvc.perform(get("/api/logs").param("to", "2026-06-15T00:00:00Z"))
                .andExpect(status().isOk());
        verify(repository).findInDateRange(null, null, null, LocalDateTime.parse("2026-06-15T00:00:00"));
    }
}
