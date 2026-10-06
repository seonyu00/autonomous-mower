package com.autonomousmower.config;

import com.autonomousmower.realtime.security.StompJwtAuthenticationInterceptor;
import com.autonomousmower.realtime.security.AccountWebSocketSessions;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
@EnableScheduling
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final StompJwtAuthenticationInterceptor stompJwtAuthenticationInterceptor;
    private final AccountWebSocketSessions sessions;

    public WebSocketConfig(StompJwtAuthenticationInterceptor stompJwtAuthenticationInterceptor, AccountWebSocketSessions sessions) {
        this.stompJwtAuthenticationInterceptor = stompJwtAuthenticationInterceptor;
        this.sessions = sessions;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .setAllowedOriginPatterns("*");
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic");
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        // CONNECT 인증과 SUBSCRIBE 허용 목록, 클라이언트 SEND 거부를 브로커 진입 전에 적용한다.
        registration.interceptors(stompJwtAuthenticationInterceptor);
    }

    @Override
    public void configureClientOutboundChannel(ChannelRegistration registration) {
        registration.interceptors(sessions);
    }

    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
        registration.addDecoratorFactory(sessions);
    }
}
