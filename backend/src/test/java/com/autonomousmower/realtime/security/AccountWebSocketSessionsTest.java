package com.autonomousmower.realtime.security;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.autonomousmower.auth.security.JwtTokenProvider;
import com.autonomousmower.auth.security.RoleName;
import com.autonomousmower.auth.security.SecurityUser;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;

class AccountWebSocketSessionsTest {
    private final JwtTokenProvider tokens = mock(JwtTokenProvider.class);
    private final AccountWebSocketSessions sessions = new AccountWebSocketSessions(tokens);
    private final SecurityUser user = SecurityUser.from("viewer", "viewer", RoleName.READ_ONLY);

    private WebSocketSession connect(String id) throws Exception {
        var socket = mock(WebSocketSession.class);
        when(socket.getId()).thenReturn(id);
        when(socket.isOpen()).thenReturn(true);
        sessions.decorate(mock(WebSocketHandler.class)).afterConnectionEstablished(socket);
        sessions.authenticate(id, user, "token");
        return socket;
    }

    private Message<byte[]> data(String id) {
        var headers = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
        headers.setSessionId(id);
        return MessageBuilder.createMessage(new byte[]{1}, headers.getMessageHeaders());
    }

    @Test
    void accountChangeClosesAllItsSocketsAndBlocksFurtherData() throws Exception {
        var first = connect("first");
        var second = connect("second");
        when(tokens.parse("token")).thenReturn(user);
        var message = data("first");
        assertThat(sessions.preSend(message, null)).isSameAs(message);
        sessions.closeForAccount("viewer");
        verify(first).close(CloseStatus.POLICY_VIOLATION);
        verify(second).close(CloseStatus.POLICY_VIOLATION);
        assertThat(sessions.preSend(message, null)).isNull();
    }

    @Test
    void expiredTokenCannotReceiveDataBeforeScheduledCleanup() throws Exception {
        var socket = connect("expired");
        when(tokens.parse("token")).thenThrow(new BadCredentialsException("expired"));
        assertThat(sessions.preSend(data("expired"), null)).isNull();
        verify(socket).close(CloseStatus.POLICY_VIOLATION);
    }

    @Test
    void idleExpiredConnectionIsClosedWithoutWaitingForData() throws Exception {
        var socket = connect("idle");
        when(tokens.parse("token")).thenThrow(new BadCredentialsException("expired"));
        sessions.closeExpiredSessions();
        verify(socket).close(CloseStatus.POLICY_VIOLATION);
    }
}
