package com.autonomousmower.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.autonomousmower.auth.security.JwtAuthenticationFilter;
import com.autonomousmower.auth.security.JwtTokenProvider;
import com.autonomousmower.auth.security.RestAccessDeniedHandler;
import com.autonomousmower.auth.security.RestAuthenticationEntryPoint;
import com.autonomousmower.auth.security.RoleName;
import com.autonomousmower.auth.security.SecurityUser;
import com.autonomousmower.realtime.security.AccountWebSocketSessions;
import com.autonomousmower.realtime.security.StompJwtAuthenticationInterceptor;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

@SpringBootTest(classes = WebSocketOriginTest.TestApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "server.address=127.0.0.1",
        "app.security.allowed-origins=https://mower-demo.example,http://localhost:5173,http://127.0.0.1:5173"
})
@ActiveProfiles("web-origin-test")
class WebSocketOriginTest {

    @LocalServerPort
    private int port;

    @MockBean
    private JwtTokenProvider tokens;

    @BeforeEach
    void allowTestToken() {
        when(tokens.parse("origin-test-token")).thenReturn(SecurityUser.from("origin-test", "Origin Test", RoleName.READ_ONLY));
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://mower-demo.example", "http://localhost:5173", "http://127.0.0.1:5173"})
    void allowedOriginCanAuthenticateStomp(String origin) throws Exception {
        WebSocketStompClient client = new WebSocketStompClient(new StandardWebSocketClient());
        try {
            StompSession session = connect(client, origin, true);
            assertThat(session.isConnected()).isTrue();
            session.disconnect();
        } finally {
            client.stop();
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"https://other.example", "https://mower-demo.example.evil.example",
            "http://mower-demo.example", "https://mower-demo.example:8443", "null"})
    void unlistedOriginCannotAuthenticateStomp(String origin) {
        WebSocketStompClient client = new WebSocketStompClient(new StandardWebSocketClient());
        try {
            assertThatThrownBy(() -> connect(client, origin, true)).isInstanceOf(ExecutionException.class);
        } finally {
            client.stop();
        }
    }

    @Test
    void allowedOriginStillRequiresStompToken() {
        WebSocketStompClient client = new WebSocketStompClient(new StandardWebSocketClient());
        try {
            assertThatThrownBy(() -> connect(client, "https://mower-demo.example", false))
                    .isInstanceOf(ExecutionException.class);
        } finally {
            client.stop();
        }
    }

    private StompSession connect(WebSocketStompClient client, String origin, boolean authenticated) throws Exception {
        WebSocketHttpHeaders handshake = new WebSocketHttpHeaders();
        handshake.setOrigin(origin);
        StompHeaders headers = new StompHeaders();
        if (authenticated) headers.set("Authorization", "Bearer origin-test-token");
        return client.connectAsync("ws://127.0.0.1:" + port + "/ws", handshake, headers,
                new StompSessionHandlerAdapter() {}).get(5, TimeUnit.SECONDS);
    }

    @Configuration(proxyBeanMethods = false)
    @Profile("web-origin-test")
    @EnableAutoConfiguration(exclude = {DataSourceAutoConfiguration.class, HibernateJpaAutoConfiguration.class,
            FlywayAutoConfiguration.class})
    @Import({SecurityConfig.class, WebSocketConfig.class, JwtAuthenticationFilter.class,
            RestAuthenticationEntryPoint.class, RestAccessDeniedHandler.class,
            StompJwtAuthenticationInterceptor.class, AccountWebSocketSessions.class})
    static class TestApplication {}
}
