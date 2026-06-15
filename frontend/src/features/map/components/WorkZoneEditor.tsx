import { useMemo, useState } from 'react';
import { useRobotStore } from '../../robots/robotStore';
import { Button } from '../../../shared/ui/Button';
import { validatePolygonGeometry } from '../geojson';
import { saveWorkZone } from '../zoneApi';
import { mockWorkZoneByRobotId } from '../mockMapData';
import { useZoneStore } from '../zoneStore';
import { closePolygonVertices, openPolygonVertices } from '../workZoneEditing';

export function WorkZoneEditor() {
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const zonesByRobotId = useZoneStore((state) => state.zonesByRobotId);
  const draftVerticesByRobotId = useZoneStore((state) => state.draftVerticesByRobotId);
  const editingByRobotId = useZoneStore((state) => state.editingByRobotId);
  const startEditing = useZoneStore((state) => state.startEditing);
  const stopEditing = useZoneStore((state) => state.stopEditing);
  const setZone = useZoneStore((state) => state.setZone);
  const setDraftVertices = useZoneStore((state) => state.setDraftVertices);
  const undoDraftVertex = useZoneStore((state) => state.undoDraftVertex);
  const resetDraft = useZoneStore((state) => state.resetDraft);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const storedPolygon = selectedRobotId
    ? zonesByRobotId[selectedRobotId] ?? mockWorkZoneByRobotId[selectedRobotId]?.geometry
    : undefined;
  const editing = selectedRobotId ? Boolean(editingByRobotId[selectedRobotId]) : false;
  const draftVertices = selectedRobotId ? draftVerticesByRobotId[selectedRobotId] ?? [] : [];
  const polygon = editing ? closePolygonVertices(draftVertices) : storedPolygon;
  const validation = useMemo(() => validatePolygonGeometry(polygon), [polygon]);
  const visibleVertices = editing ? draftVertices : openPolygonVertices(polygon);

  const handleSave = async () => {
    if (!selectedRobotId || !polygon || !validation.valid) {
      return;
    }

    const response = await saveWorkZone(selectedRobotId, polygon);
    setZone(selectedRobotId, polygon);
    stopEditing(selectedRobotId);
    setSaveMessage(
      response.saved
        ? '작업 구역을 저장했습니다.'
        : '개발 모드 저장 요청을 확인했습니다. 실제 DB에는 저장되지 않았습니다.',
    );
  };

  return (
    <div className="work-zone-editor">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">2단계</p>
          <h2>작업 구역(Work Zone)</h2>
        </div>
        <span className={editing ? 'status-pill degraded' : 'status-pill connected'}>
          {editing ? `편집 중 · ${draftVertices.length}점` : '조회 모드'}
        </span>
      </div>

      <p className="muted">{editing ? '지도에서 꼭짓점을 선택하세요' : '새 구역을 그리거나 샘플 구역을 불러와 편집할 수 있습니다.'}</p>

      <div className="coordinate-list" aria-label="Polygon 좌표 목록">
        {visibleVertices.length > 0 ? (
          visibleVertices.map(([longitude, latitude], index) => (
            <div key={`${longitude}-${latitude}-${index}`} className="coordinate-row">
              <span>{index + 1}</span>
              <code>{longitude.toFixed(6)}</code>
              <code>{latitude.toFixed(6)}</code>
            </div>
          ))
        ) : (
          <p className="coordinate-empty">선택된 꼭짓점이 없습니다.</p>
        )}
      </div>

      {editing && validation.errors.length > 0 ? (
        <ul className="validation-list">
          {validation.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}

      <div className="work-zone-actions">
        {!editing ? (
          <Button
            type="button"
            variant="primary"
            disabled={!selectedRobotId}
            onClick={() => selectedRobotId && startEditing(selectedRobotId)}
          >
            새 구역 그리기
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={draftVertices.length === 0}
              onClick={() => selectedRobotId && undoDraftVertex(selectedRobotId)}
            >
              마지막 점 취소
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (!selectedRobotId) return;
                setDraftVertices(
                  selectedRobotId,
                  openPolygonVertices(mockWorkZoneByRobotId[selectedRobotId]?.geometry),
                );
              }}
            >
              샘플 구역 불러오기
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={draftVertices.length === 0}
              onClick={() => selectedRobotId && resetDraft(selectedRobotId)}
            >
              전체 초기화
            </Button>
            <Button type="button" variant="primary" disabled={!validation.valid} onClick={handleSave}>
              작업 구역 저장
            </Button>
          </>
        )}
      </div>

      {saveMessage ? <p className="save-note">{saveMessage}</p> : null}
    </div>
  );
}
