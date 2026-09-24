package com.autonomousmower.workzone.controller;

import com.autonomousmower.auth.security.*;
import com.autonomousmower.config.SecurityConfig;
import com.autonomousmower.workzone.dto.*;
import com.autonomousmower.workzone.service.CppPreviewService;
import com.autonomousmower.common.exception.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(CppPreviewController.class)
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, RestAuthenticationEntryPoint.class, RestAccessDeniedHandler.class})
class CppPreviewControllerTest {
    @Autowired MockMvc mvc;
    @MockBean CppPreviewService service;
    @MockBean JwtTokenProvider jwt;
    static final String URL = "/api/robots/R1/work-zone/cpp-preview";
    static final String INPUT = "{\"expectedVersion\":2,\"cellSizeM\":1}";

    @Test void requiresAuthentication() throws Exception {
        mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(INPUT)).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }
    @Test @WithMockUser(authorities = "logs:read") void requiresRobotReadPermission() throws Exception {
        mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(INPUT)).andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }
    @Test @WithMockUser(authorities = "robots:read") void returnsPreviewWithoutControlPermission() throws Exception {
        when(service.preview(eq("R1"), any())).thenReturn(new CppPreviewResponse("R1", 1L, 2, 1,
                10, 10, new CppPreviewResponse.Point(37, 127), List.of(new CppPreviewResponse.Point(37.0001, 127.0001))));
        mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(INPUT)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.path[0].lat").value(37.0001))
                .andExpect(jsonPath("$.data.version").value(2));
    }
    @Test @WithMockUser(authorities = "robots:read") void validatesRequestBeforeInvokingCpp() throws Exception {
        for (String input : List.of("{}", "{\"expectedVersion\":2,\"cellSizeM\":0}",
                "{\"expectedVersion\":-1,\"cellSizeM\":1}", "{\"expectedVersion\":2,\"cellSizeM\":6}")) {
            mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(input)).andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
    }
    @Test @WithMockUser(authorities = "robots:read") void exposesOversizedGridAsInputError() throws Exception {
        when(service.preview(any(), any())).thenThrow(new BusinessException(ErrorCode.CPP_GRID_TOO_LARGE));
        mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(INPUT))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.code").value("CPP_GRID_TOO_LARGE"))
                .andExpect(jsonPath("$.error.message").value("구역 크기에 비해 격자가 큽니다. 격자 간격을 줄이세요."));
    }
    @Test @WithMockUser(authorities = "robots:read") void exposesTimeoutAsGatewayTimeout() throws Exception {
        when(service.preview(any(), any())).thenThrow(new BusinessException(ErrorCode.CPP_TIMEOUT));
        mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(INPUT)).andExpect(status().isGatewayTimeout())
                .andExpect(jsonPath("$.error.code").value("CPP_TIMEOUT"));
    }
}
