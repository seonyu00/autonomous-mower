package com.autonomousmower.realtime.security;

import com.autonomousmower.auth.security.JwtTokenProvider;
import com.autonomousmower.auth.security.SecurityUser;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class StompJwtAuthenticationInterceptor implements ChannelInterceptor {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtTokenProvider jwtTokenProvider;

    public StompJwtAuthenticationInterceptor(JwtTokenProvider jwtTokenProvider) {
        this.jwtTokenProvider = jwtTokenProvider;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() != StompCommand.CONNECT) {
            return message;
        }

        String token = resolveBearerToken(accessor);
        if (token == null) {
            throw new AccessDeniedException("Missing STOMP Authorization header.");
        }

        SecurityUser user = jwtTokenProvider.parse(token);
        UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                user,
                token,
                user.getAuthorities()
        );
        accessor.setUser(authentication);
        return message;
    }

    private String resolveBearerToken(StompHeaderAccessor accessor) {
        List<String> headers = accessor.getNativeHeader(HttpHeaders.AUTHORIZATION);
        if (headers == null || headers.isEmpty()) {
            return null;
        }

        String value = headers.getFirst();
        if (!StringUtils.hasText(value) || !value.startsWith(BEARER_PREFIX)) {
            return null;
        }
        return value.substring(BEARER_PREFIX.length());
    }
}
