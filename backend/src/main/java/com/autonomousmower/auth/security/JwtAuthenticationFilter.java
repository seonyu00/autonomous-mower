package com.autonomousmower.auth.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtTokenProvider jwtTokenProvider;
    private final com.autonomousmower.auth.service.EdgeWorkZoneTokenService edgeTokens;

    public JwtAuthenticationFilter(JwtTokenProvider jwtTokenProvider,
                                   com.autonomousmower.auth.service.EdgeWorkZoneTokenService edgeTokens) {
        this.jwtTokenProvider = jwtTokenProvider;
        this.edgeTokens = edgeTokens;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String token = resolveToken(request);
        if (token != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            try {
                var edge = edgeTokens.authenticate(token);
                UsernamePasswordAuthenticationToken authentication;
                if (edge != null) {
                    authentication = new UsernamePasswordAuthenticationToken(edge, token,
                            AuthorityUtils.createAuthorityList("edge:work-zone:read"));
                } else {
                    SecurityUser user = jwtTokenProvider.parse(token);
                    authentication = new UsernamePasswordAuthenticationToken(user, token, user.getAuthorities());
                }
                authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authentication);
            } catch (RuntimeException exception) {
                SecurityContextHolder.clearContext();
            }
        }

        filterChain.doFilter(request, response);
    }

    private String resolveToken(HttpServletRequest request) {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (!StringUtils.hasText(header) || !header.startsWith(BEARER_PREFIX)) {
            return null;
        }
        return header.substring(BEARER_PREFIX.length());
    }
}
