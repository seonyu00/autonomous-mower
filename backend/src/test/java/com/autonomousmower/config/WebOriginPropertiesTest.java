package com.autonomousmower.config;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class WebOriginPropertiesTest {

    @ParameterizedTest
    @ValueSource(strings = {"*", "https://*.vercel.app", "https://mower-demo.example/login",
            "ws://mower-demo.example", "https://user:password@mower-demo.example",
            "https://mower-demo.example?query=1", "https://mower-demo.example#fragment", "null", "",
            "https://mower-demo.example:443", "http://mower-demo.example:80",
            "https://mower-demo.example:65536", "https://mower-demo.example:"})
    void rejectsValuesThatAreNotExplicitHttpOrigins(String origin) {
        assertThatThrownBy(() -> new WebOriginProperties(List.of(origin)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsMissingAllowlist() {
        assertThatThrownBy(() -> new WebOriginProperties(null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsEmptyAllowlist() {
        assertThatThrownBy(() -> new WebOriginProperties(List.of())).isInstanceOf(IllegalArgumentException.class);
    }
}
