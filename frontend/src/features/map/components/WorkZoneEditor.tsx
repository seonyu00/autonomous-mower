import { useMemo, useState } from 'react';
import { useRobotStore } from '../../robots/robotStore';
import { Button } from '../../../shared/ui/Button';
import { fromPostGisPolygonPayload, toPostGisPolygonPayload, validatePolygonGeometry } from '../geojson';
import { saveWorkZone } from '../zoneApi';
import { mockWorkZoneByRobotId } from '../mockMapData';
import type { PostGisPolygonPayload } from '../geojson';

export function WorkZoneEditor() {
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const polygon = selectedRobotId ? mockWorkZoneByRobotId[selectedRobotId]?.geometry : undefined;
  const validation = useMemo(() => validatePolygonGeometry(polygon), [polygon]);
  const postGisPayload = useMemo(() => (polygon ? toPostGisPolygonPayload(polygon) : null), [polygon]);
  const [lastSaveRequest, setLastSaveRequest] = useState<PostGisPolygonPayload | null>(null);

  const exteriorRing = polygon?.coordinates[0] ?? [];

  const handleMockSave = async () => {
    if (!selectedRobotId || !polygon || !validation.valid) {
      return;
    }

    const response = await saveWorkZone(selectedRobotId, polygon);
    setLastSaveRequest(response.zone);
  };

  return (
    <div className="work-zone-editor">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">2단계</p>
          <h2>작업 구역(Work Zone)</h2>
        </div>
        <span className={validation.valid ? 'status-pill connected' : 'status-pill degraded'}>
          {validation.valid ? '4326 유효' : '유효하지 않음'}
        </span>
      </div>

      <p className="muted">
        현재는 샘플 Polygon을 읽고 검증한 뒤 저장 요청 payload를 만들어 보는 단계입니다. 지도 편집과 실제 저장은 아직 연결하지 않았습니다.
      </p>

      <div className="coordinate-list" aria-label="Polygon 좌표 목록">
        {exteriorRing.map(([longitude, latitude], index) => (
          <div key={`${longitude}-${latitude}-${index}`} className="coordinate-row">
            <span>{index + 1}</span>
            <code>{longitude.toFixed(6)}</code>
            <code>{latitude.toFixed(6)}</code>
          </div>
        ))}
      </div>

      {validation.errors.length > 0 ? (
        <ul className="validation-list">
          {validation.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}

      <div className="work-zone-actions">
        <Button type="button" variant="primary" disabled={!validation.valid} onClick={handleMockSave}>
          저장 요청 생성
        </Button>
      </div>

      {postGisPayload ? (
        <pre className="payload-preview">{JSON.stringify(postGisPayload, null, 2)}</pre>
      ) : (
        <p className="warning-line">선택한 로봇에 등록된 샘플 작업 구역(Work Zone)이 없습니다.</p>
      )}

      {lastSaveRequest ? (
        <p className="save-note">
          SRID {lastSaveRequest.srid} 기준 저장 요청 payload를 만들었습니다. Geometry 유형:{' '}
          {fromPostGisPolygonPayload(lastSaveRequest).type}
        </p>
      ) : null}
    </div>
  );
}
