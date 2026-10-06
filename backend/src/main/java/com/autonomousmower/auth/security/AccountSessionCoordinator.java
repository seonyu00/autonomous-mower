package com.autonomousmower.auth.security;

import java.util.function.Supplier;
import org.springframework.stereotype.Component;

@Component
public class AccountSessionCoordinator {
    // 현재 단일 서버에서 제어권 취득과 계정 변경 완료가 교차하지 않게 한다.
    public synchronized <T> T execute(Supplier<T> action) { return action.get(); }
}
