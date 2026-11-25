package com.opesware.maintain.platform.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class LoginRateLimiterTest {
    @Test
    void blocksAfterLimitPerAddressAndIgnoresOtherEndpoints() throws Exception {
        LoginRateLimiter limiter = new LoginRateLimiter(3);
        int last = 0;
        for (int i = 0; i < 4; i++) {
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/v1/auth/login");
            req.setRemoteAddr("203.0.113.7");
            MockHttpServletResponse res = new MockHttpServletResponse();
            limiter.doFilter(req, res, new MockFilterChain());
            last = res.getStatus();
        }
        assertThat(last).isEqualTo(429);
        MockHttpServletRequest other = new MockHttpServletRequest("POST", "/api/v1/auth/login");
        other.setRemoteAddr("203.0.113.8");
        MockHttpServletResponse ok = new MockHttpServletResponse();
        limiter.doFilter(other, ok, new MockFilterChain());
        assertThat(ok.getStatus()).isEqualTo(200);
        MockHttpServletRequest api = new MockHttpServletRequest("GET", "/api/v1/work-orders");
        api.setRemoteAddr("203.0.113.7");
        MockHttpServletResponse r2 = new MockHttpServletResponse();
        limiter.doFilter(api, r2, new MockFilterChain());
        assertThat(r2.getStatus()).isEqualTo(200);
    }
}
