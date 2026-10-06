package com.autonomousmower.account.controller;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.autonomousmower.account.service.AccountService;
import com.autonomousmower.auth.security.*;
import com.autonomousmower.config.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(AccountController.class)
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, RestAuthenticationEntryPoint.class, RestAccessDeniedHandler.class})
class AccountControllerTest {
    @Autowired MockMvc mvc;
    @MockBean AccountService accounts;
    @MockBean JwtTokenProvider tokens;

    @Test
    void anonymousAndNonAdminCannotReadOrChangeAccounts() throws Exception {
        mvc.perform(get("/api/accounts")).andExpect(status().isUnauthorized());
        for (RoleName role : new RoleName[]{RoleName.READ_ONLY, RoleName.OPERATOR, RoleName.SUPERVISOR}) {
            when(tokens.parse("token")).thenReturn(SecurityUser.from("user", "user", role));
            mvc.perform(get("/api/accounts").header("Authorization", "Bearer token")).andExpect(status().isForbidden());
            mvc.perform(patch("/api/accounts/target").header("Authorization", "Bearer token")
                    .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"admin\",\"enabled\":true,\"expectedVersion\":0}"))
                    .andExpect(status().isForbidden());
        }
        verifyNoInteractions(accounts);
    }

    @Test
    void invalidCreationAndPaginationNeverReachTheService() throws Exception {
        when(tokens.parse("token")).thenReturn(SecurityUser.from("admin", "admin", RoleName.ADMIN));
        for (String id : new String[]{"a".repeat(21), "contains space", "한글"}) {
            mvc.perform(post("/api/accounts").header("Authorization", "Bearer token")
                    .contentType(MediaType.APPLICATION_JSON).content("{\"adminId\":\"" + id + "\",\"role\":\"read-only\",\"temporaryPassword\":\"test-pass-10\"}"))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(get("/api/accounts?size=101").header("Authorization", "Bearer token")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/accounts/audit?page=-1").header("Authorization", "Bearer token")).andExpect(status().isBadRequest());
        verifyNoInteractions(accounts);
    }
}
