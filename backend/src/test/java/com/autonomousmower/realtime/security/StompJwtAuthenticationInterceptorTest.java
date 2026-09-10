package com.autonomousmower.realtime.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.autonomousmower.auth.security.JwtTokenProvider;
import com.autonomousmower.auth.security.RoleName;
import com.autonomousmower.auth.security.SecurityUser;
import io.jsonwebtoken.JwtException;
import java.security.Principal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

@ExtendWith(MockitoExtension.class)
class StompJwtAuthenticationInterceptorTest {

    @Mock
    private JwtTokenProvider jwtTokenProvider;

    @Mock
    private MessageChannel messageChannel;

    @Test
    void connectWithBearerTokenSetsAuthenticatedPrincipal() {
        SecurityUser user = SecurityUser.from("admin", "ADMIN USER", RoleName.ADMIN);
        when(jwtTokenProvider.parse("valid-token")).thenReturn(user);
        StompJwtAuthenticationInterceptor interceptor = new StompJwtAuthenticationInterceptor(jwtTokenProvider);
        Message<byte[]> message = connectMessage("Bearer valid-token");

        Message<?> result = interceptor.preSend(message, messageChannel);

        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(result);
        Principal principal = accessor.getUser();
        assertThat(principal).isInstanceOf(UsernamePasswordAuthenticationToken.class);
        assertThat(principal.getName()).isEqualTo("admin");
    }

    @Test
    void connectWithoutBearerTokenIsRejected() {
        StompJwtAuthenticationInterceptor interceptor = new StompJwtAuthenticationInterceptor(jwtTokenProvider);
        Message<byte[]> message = connectMessage(null);

        assertThatThrownBy(() -> interceptor.preSend(message, messageChannel))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void invalidJwtCannotAuthenticateConnection() {
        when(jwtTokenProvider.parse("invalid-token")).thenThrow(new JwtException("Invalid test token"));
        StompJwtAuthenticationInterceptor interceptor = new StompJwtAuthenticationInterceptor(jwtTokenProvider);
        Message<byte[]> message = connectMessage("Bearer invalid-token");
        assertThatThrownBy(() -> interceptor.preSend(message, messageChannel)).isInstanceOf(JwtException.class);
        assertThat(StompHeaderAccessor.wrap(message).getUser()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"telemetry", "status", "events", "control-lock", "control-events", "video-status"})
    void readOnlyUserCanSubscribeToPublishedTopics(String topic) {
        StompJwtAuthenticationInterceptor interceptor = new StompJwtAuthenticationInterceptor(jwtTokenProvider);
        SecurityUser user = SecurityUser.from("viewer", "VIEWER", RoleName.READ_ONLY);
        when(jwtTokenProvider.parse("valid-token")).thenReturn(user);
        Message<?> connected = interceptor.preSend(connectMessage("Bearer valid-token"), messageChannel);
        Principal principal = StompHeaderAccessor.wrap(connected).getUser();
        Message<byte[]> subscription = frame(StompCommand.SUBSCRIBE, "/topic/robots/mower-01/" + topic, principal);

        assertThat(interceptor.preSend(subscription, messageChannel)).isSameAs(subscription);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"/topic/other", "/app/test", "/user/queue/test", "/topic/robots/mower-01/unknown",
            "/topic/robots/mower-01/telemetry/extra", "/topic/robots//telemetry",
            "/topic/robots/*/telemetry", "/topic/robots/**", "/topic/robots/{id}/telemetry",
            "/topic/robots/mower-01/telemetry/", "/topic/robots/mower-?1/status"})
    void unauthorizedDestinationIsRejected(String destination) {
        assertRejected(StompCommand.SUBSCRIBE, destination, reader());
    }

    @Test
    void subscriptionWithoutAuthenticationIsRejected() {
        assertRejected(StompCommand.SUBSCRIBE, "/topic/robots/mower-01/telemetry", null);
    }

    @Test
    void unauthenticatedPrincipalWithReadAuthorityIsRejected() {
        UsernamePasswordAuthenticationToken principal = reader();
        principal.setAuthenticated(false);
        assertRejected(StompCommand.SUBSCRIBE, "/topic/robots/mower-01/telemetry", principal);
    }

    @Test
    void subscriptionWithoutReadAuthorityIsRejected() {
        Principal principal = new UsernamePasswordAuthenticationToken("operator", null,
                List.of(new SimpleGrantedAuthority("control:write")));
        assertRejected(StompCommand.SUBSCRIBE, "/topic/robots/mower-01/telemetry", principal);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"/topic/robots/mower-01/telemetry", "/topic/robots/mower-01/events",
            "/topic/robots/mower-01/status", "/topic/robots/mower-01/control-lock",
            "/topic/robots/mower-01/control-events", "/topic/robots/mower-01/video-status",
            "/app/control", "/queue/test", "/unknown"})
    void allClientSendsAreRejectedEvenForAdmin(String destination) {
        SecurityUser user = SecurityUser.from("admin", "ADMIN", RoleName.ADMIN);
        assertRejected(StompCommand.SEND, destination,
                new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities()));
    }

    @Test
    void unauthenticatedSendIsRejected() {
        assertRejected(StompCommand.SEND, "/topic/robots/mower-01/events", null);
    }

    @Test
    void unsubscribeDisconnectAndHeartbeatRemainAvailable() {
        StompJwtAuthenticationInterceptor interceptor = new StompJwtAuthenticationInterceptor(jwtTokenProvider);
        for (StompCommand command : List.of(StompCommand.UNSUBSCRIBE, StompCommand.DISCONNECT)) {
            Message<byte[]> message = frame(command, null, reader());
            assertThat(interceptor.preSend(message, messageChannel)).isSameAs(message);
        }
        Message<byte[]> heartbeat = MessageBuilder.createMessage(new byte[0],
                StompHeaderAccessor.createForHeartbeat().getMessageHeaders());
        assertThat(interceptor.preSend(heartbeat, messageChannel)).isSameAs(heartbeat);
    }

    private void assertRejected(StompCommand command, String destination, Principal principal) {
        StompJwtAuthenticationInterceptor interceptor = new StompJwtAuthenticationInterceptor(jwtTokenProvider);
        assertThatThrownBy(() -> interceptor.preSend(frame(command, destination, principal), messageChannel))
                .isInstanceOf(AccessDeniedException.class);
    }

    private UsernamePasswordAuthenticationToken reader() {
        return new UsernamePasswordAuthenticationToken("viewer", null,
                List.of(new SimpleGrantedAuthority("telemetry:read")));
    }

    private Message<byte[]> frame(StompCommand command, String destination, Principal principal) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(command);
        accessor.setDestination(destination);
        accessor.setUser(principal);
        accessor.setLeaveMutable(true);
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }

    private Message<byte[]> connectMessage(String authorizationHeader) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.setLeaveMutable(true);
        if (authorizationHeader != null) {
            accessor.addNativeHeader(HttpHeaders.AUTHORIZATION, authorizationHeader);
        }
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }
}
