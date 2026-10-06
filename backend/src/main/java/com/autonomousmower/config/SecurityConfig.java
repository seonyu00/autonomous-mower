package com.autonomousmower.config;

import com.autonomousmower.auth.security.JwtAuthenticationFilter;
import com.autonomousmower.auth.security.RestAccessDeniedHandler;
import com.autonomousmower.auth.security.RestAuthenticationEntryPoint;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            JwtAuthenticationFilter jwtAuthenticationFilter,
            RestAuthenticationEntryPoint authenticationEntryPoint,
            RestAccessDeniedHandler accessDeniedHandler
    ) throws Exception {
        return http
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint(authenticationEntryPoint)
                        .accessDeniedHandler(accessDeniedHandler)
                )
                .authorizeHttpRequests(requests -> requests
                        .requestMatchers("/api/auth/login", "/api/health", "/actuator/health", "/actuator/info", "/ws/**").permitAll()
                        .requestMatchers("/api/auth/me", "/api/auth/password").authenticated()
                        .requestMatchers("/api/accounts/**").hasAuthority("accounts:read")
                        .requestMatchers("/api/**").access(org.springframework.security.authorization.AuthorizationManagers.allOf(
                                org.springframework.security.authorization.AuthenticatedAuthorizationManager.authenticated(),
                                (authentication, context) -> {
                            var principal = authentication.get().getPrincipal();
                            boolean allowed = !(principal instanceof com.autonomousmower.auth.security.SecurityUser user
                                    && user.isMustChangePassword());
                            return new org.springframework.security.authorization.AuthorizationDecision(allowed);
                        }))
                        .anyRequest().authenticated()
                )
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
