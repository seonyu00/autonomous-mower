package com.autonomousmower.realtime.security;

import com.autonomousmower.auth.security.JwtTokenProvider;
import com.autonomousmower.auth.security.SecurityUser;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.WebSocketHandlerDecorator;
import org.springframework.web.socket.handler.WebSocketHandlerDecoratorFactory;

@Component
public class AccountWebSocketSessions implements WebSocketHandlerDecoratorFactory, ChannelInterceptor {
    private record AccountSession(String adminId, String token) {}
    private final Map<String, WebSocketSession> sockets = new ConcurrentHashMap<>();
    private final Map<String, AccountSession> accounts = new ConcurrentHashMap<>();
    private final JwtTokenProvider tokens;

    public AccountWebSocketSessions(JwtTokenProvider tokens) { this.tokens = tokens; }

    @Override
    public WebSocketHandler decorate(WebSocketHandler handler) {
        return new WebSocketHandlerDecorator(handler) {
            @Override
            public void afterConnectionEstablished(WebSocketSession session) throws Exception {
                sockets.put(session.getId(), session);
                super.afterConnectionEstablished(session);
            }

            @Override
            public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
                sockets.remove(session.getId());
                accounts.remove(session.getId());
                super.afterConnectionClosed(session, status);
            }
        };
    }

    public void authenticate(String sessionId, SecurityUser user, String token) {
        if (sessionId != null) accounts.put(sessionId, new AccountSession(user.getAdminId(), token));
    }

    public void closeForAccount(String adminId) {
        accounts.forEach((id, account) -> { if (account.adminId().equals(adminId)) close(id); });
    }

    @Scheduled(fixedDelay = 1000)
    public void closeExpiredSessions() {
        accounts.forEach((id, account) -> {
            try { tokens.parse(account.token()); } catch (RuntimeException expired) { close(id); }
        });
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        var headers = StompHeaderAccessor.wrap(message);
        if (headers.getMessageType() == SimpMessageType.MESSAGE) {
            String id = headers.getSessionId();
            AccountSession account = id == null ? null : accounts.get(id);
            // 종료와 발행이 경합해도 이전 세션에는 로봇 데이터를 전달하지 않는다.
            if (account == null) return null;
            try { tokens.parse(account.token()); } catch (RuntimeException expired) { close(id); return null; }
        }
        return message;
    }

    private void close(String id) {
        accounts.remove(id);
        WebSocketSession session = sockets.get(id);
        if (session == null || !session.isOpen()) return;
        try { session.close(CloseStatus.POLICY_VIOLATION); }
        catch (java.io.IOException ignored) { /* 다음 송신도 인증된 세션 목록에서 차단된다. */ }
    }
}
