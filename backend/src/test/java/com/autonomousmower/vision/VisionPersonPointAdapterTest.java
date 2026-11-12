package com.autonomousmower.vision;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class VisionPersonPointAdapterTest {
    private final VisionPersonPointAdapter adapter = new VisionPersonPointAdapter();
    @Test void personAreaHasOneMeterRadiusAndClosedPolygon() {
        var input = adapter.adapt(new VisionPersonPointAdapter.Point("one", 1, Instant.now(), "fixture",
                127, 37, true, true, true));
        var ring = input.area().geometry().coordinates().getFirst();
        assertThat(ring).hasSize(33);
        assertThat(ring.getFirst()).isEqualTo(ring.getLast());
        double deltaLat = Math.toRadians(ring.getFirst().get(1) - 37);
        assertThat(deltaLat * 6_371_008.8).isBetween(0.99, 1.01);
        double deltaLon = Math.toRadians(ring.get(8).get(0) - 127);
        assertThat(deltaLon * 6_371_008.8 * Math.cos(Math.toRadians(37))).isBetween(0.99, 1.01);
        assertThat(input.state()).isEqualTo(VisionMapService.State.DANGEROUS);
    }
    @Test void missingOrInvalidMeasurementsAreRejected() {
        assertThatThrownBy(() -> adapter.adapt(new VisionPersonPointAdapter.Point("one", 1, Instant.now(), "fixture",
                127, 37, false, true, true))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> adapter.adapt(new VisionPersonPointAdapter.Point("one", 1, Instant.now(), "fixture",
                127, 37, true, true, false))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> adapter.adapt(new VisionPersonPointAdapter.Point("one", 1, Instant.now(), "fixture",
                127, 37, true, false, true))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> adapter.adapt(new VisionPersonPointAdapter.Point("one", 1, Instant.now(), "fixture",
                Double.NaN, 37, true, true, true))).isInstanceOf(IllegalArgumentException.class);
    }
}
