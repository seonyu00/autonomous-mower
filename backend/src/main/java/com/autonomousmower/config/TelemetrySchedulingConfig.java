package com.autonomousmower.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Configuration
public class TelemetrySchedulingConfig {
    @Bean ThreadPoolTaskScheduler taskScheduler() {
        return new ThreadPoolTaskScheduler();
    }

    // 계정 재검증 등 다른 주기 작업이 DB 응답을 기다려도 3초 감시는 계속한다.
    @Bean ThreadPoolTaskScheduler telemetryWatchdog() {
        return new ThreadPoolTaskScheduler();
    }
}
