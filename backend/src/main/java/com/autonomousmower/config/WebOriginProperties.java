package com.autonomousmower.config;

import java.net.URI;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.security")
public record WebOriginProperties(List<String> allowedOrigins) {

    public WebOriginProperties {
        if (allowedOrigins == null || allowedOrigins.isEmpty()) {
            throw new IllegalArgumentException("허용할 프론트 Origin을 하나 이상 지정해야 합니다.");
        }
        allowedOrigins = List.copyOf(allowedOrigins);
        for (String origin : allowedOrigins) {
            URI uri = URI.create(origin);
            // 전체 공개나 경로를 포함한 잘못된 설정을 시작 시점에 거부한다.
            if (!("http".equals(uri.getScheme()) || "https".equals(uri.getScheme()))
                    || uri.getHost() == null || origin.contains("*") || uri.getUserInfo() != null
                    || (uri.getRawPath() != null && !uri.getRawPath().isEmpty())
                    || uri.getRawQuery() != null || uri.getRawFragment() != null
                    || uri.getPort() > 65535 || origin.endsWith(":")
                    || ("http".equals(uri.getScheme()) && uri.getPort() == 80)
                    || ("https".equals(uri.getScheme()) && uri.getPort() == 443)) {
                throw new IllegalArgumentException("허용 Origin에는 기본 포트·경로·와일드카드 없는 유효한 HTTP 또는 HTTPS 주소를 지정해야 합니다.");
            }
        }
    }
}
