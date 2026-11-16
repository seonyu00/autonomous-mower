package com.autonomousmower.vision;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class VisionObservationServiceTest {
    @Test void personUsesOneMeterDangerAndBushRemainsUnknown() {
        var maps = mock(VisionMapService.class);
        var service = new VisionObservationService(maps);
        var time = Instant.now();
        var polygon = VisionWebIntegrationTest.area(127.1,127.2,37.1,37.2);
        service.record("A", new VisionObservationController.Batch(2,"session",List.of(
            new VisionObservationController.Observation("person",time,VisionObservationController.ObjectType.PERSON,127.15,37.15,null),
            new VisionObservationController.Observation("bush",time,VisionObservationController.ObjectType.BUSH_CANDIDATE,null,null,polygon))));
        var inputs = ArgumentCaptor.forClass(VisionMapService.Input.class);
        verify(maps,times(2)).record(eq("A"),inputs.capture());
        assertThat(inputs.getAllValues().get(0).state()).isEqualTo(VisionMapService.State.DANGEROUS);
        assertThat(inputs.getAllValues().get(0).area().geometry().coordinates().getFirst()).hasSize(33);
        assertThat(inputs.getAllValues().get(1).state()).isEqualTo(VisionMapService.State.UNKNOWN);
        assertThat(inputs.getAllValues().get(1).observationId()).isEqualTo("session:bush");
    }

    @Test void missingCoordinatesAndCandidateAreaRejected() {
        var maps = mock(VisionMapService.class);
        var service = new VisionObservationService(maps);
        for (var type : VisionObservationController.ObjectType.values()) {
            assertThatThrownBy(() -> service.record("A",new VisionObservationController.Batch(2,"s",List.of(
                new VisionObservationController.Observation("bad",Instant.now(),type,null,null,null)))))
                .isInstanceOf(com.autonomousmower.common.exception.BusinessException.class);
        }
        verifyNoInteractions(maps);
    }
}
