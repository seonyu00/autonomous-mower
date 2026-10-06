package com.autonomousmower.account.service;

import static org.assertj.core.api.Assertions.*;
import com.autonomousmower.common.exception.BusinessException;
import org.junit.jupiter.api.Test;

class PasswordPolicyTest {
    @Test
    void validatesTenCodePointsAndSeventyTwoUtf8BytesWithoutTruncation() {
        assertThatThrownBy(() -> AccountService.validatePassword("123456789")).isInstanceOf(BusinessException.class);
        assertThatCode(() -> AccountService.validatePassword("1234567890")).doesNotThrowAnyException();
        assertThatCode(() -> AccountService.validatePassword("가".repeat(24))).doesNotThrowAnyException();
        assertThatThrownBy(() -> AccountService.validatePassword("가".repeat(25))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> AccountService.validatePassword("😀".repeat(9))).isInstanceOf(BusinessException.class);
        assertThatCode(() -> AccountService.validatePassword("😀".repeat(10))).doesNotThrowAnyException();
    }
}
