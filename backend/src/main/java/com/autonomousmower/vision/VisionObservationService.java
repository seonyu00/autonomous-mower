package com.autonomousmower.vision;

import com.autonomousmower.common.exception.BusinessException;
import com.autonomousmower.common.exception.ErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class VisionObservationService {
    private final VisionMapService maps;
    public VisionObservationService(VisionMapService maps) { this.maps = maps; }

    @Transactional
    public void record(String robotId, VisionObservationController.Batch batch) {
        for (var observation : batch.observations()) {
            String id = batch.sessionId() + ":" + observation.observationId();
            if (id.length() > 128) throw new BusinessException(ErrorCode.INVALID_REQUEST);
            String source = "dual_gps_vision:" + observation.objectType().name().toLowerCase(java.util.Locale.ROOT);
            VisionMapService.Input input;
            if (observation.objectType() == VisionObservationController.ObjectType.PERSON) {
                if (observation.longitude() == null || observation.latitude() == null)
                    throw new BusinessException(ErrorCode.INVALID_REQUEST);
                try {
                    input = new VisionPersonPointAdapter().adapt(new VisionPersonPointAdapter.Point(
                        id, batch.version(), observation.observedAt(), source,
                        observation.longitude(), observation.latitude(), true, true, true));
                } catch (IllegalArgumentException error) {
                    throw new BusinessException(ErrorCode.INVALID_REQUEST);
                }
            } else {
                var area = observation.area();
                if (area == null || area.geometry() == null || area.geometry().coordinates() == null
                        || area.geometry().coordinates().size() != 1
                        || area.geometry().coordinates().getFirst() == null
                        || area.geometry().coordinates().getFirst().size() > 33)
                    throw new BusinessException(ErrorCode.INVALID_REQUEST);
                for (var point : area.geometry().coordinates().getFirst()) {
                    if (point == null || point.size() != 2 || point.get(0) == null || point.get(1) == null
                            || !Double.isFinite(point.get(0)) || !Double.isFinite(point.get(1)))
                        throw new BusinessException(ErrorCode.INVALID_REQUEST);
                }
                // 나무·덤불 후보를 주행 가능 또는 확정 위험으로 승격하지 않는다.
                input = new VisionMapService.Input(id, batch.version(), observation.observedAt(),
                    VisionMapService.State.UNKNOWN, source, area);
            }
            // 구역 버전, 미래 시각, 다각형과 구역 교집합·중복 ID는 기존 저장 경로에서 검사한다.
            maps.record(robotId, input);
        }
    }
}
