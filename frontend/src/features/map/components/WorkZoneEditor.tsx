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
          <p className="eyebrow">Phase 2</p>
          <h2>Work Zone</h2>
        </div>
        <span className={validation.valid ? 'status-pill connected' : 'status-pill degraded'}>
          {validation.valid ? 'valid 4326' : 'invalid'}
        </span>
      </div>

      <p className="muted">
        Mock Polygon을 읽기/검증/저장 요청 payload로만 처리합니다. 지도 위 편집과 실제 저장은 아직 비활성화되어 있습니다.
      </p>

      <div className="coordinate-list" aria-label="Polygon coordinate list">
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
          Build Save Request
        </Button>
      </div>

      {postGisPayload ? (
        <pre className="payload-preview">{JSON.stringify(postGisPayload, null, 2)}</pre>
      ) : (
        <p className="warning-line">No mock work zone is available for the selected robot.</p>
      )}

      {lastSaveRequest ? (
        <p className="save-note">
          Mock save request built for SRID {lastSaveRequest.srid}. Geometry type:{' '}
          {fromPostGisPolygonPayload(lastSaveRequest).type}
        </p>
      ) : null}
    </div>
  );
}
