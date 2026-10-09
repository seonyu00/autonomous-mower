import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../auth/authStore';
import { useRobotStore } from '../../robots/robotStore';
import { Button } from '../../../shared/ui/Button';
import { ApiError } from '../../../shared/api/errors';
import { validatePolygonGeometry } from '../geojson';
import { getWorkZone, isMockWorkZoneEnabled, saveWorkZone } from '../zoneApi';
import { mockWorkZoneByRobotId } from '../mockMapData';
import { useZoneStore } from '../zoneStore';
import { closePolygonVertices, openPolygonVertices } from '../workZoneEditing';

export function WorkZoneEditor() {
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const zonesByRobotId = useZoneStore((state) => state.zonesByRobotId);
  const versionsByRobotId = useZoneStore((state) => state.versionsByRobotId);
  const draftVerticesByRobotId = useZoneStore((state) => state.draftVerticesByRobotId);
  const editingByRobotId = useZoneStore((state) => state.editingByRobotId);
  const startEditing = useZoneStore((state) => state.startEditing);
  const stopEditing = useZoneStore((state) => state.stopEditing);
  const setZone = useZoneStore((state) => state.setZone);
  const setDraftVertices = useZoneStore((state) => state.setDraftVertices);
  const undoDraftVertex = useZoneStore((state) => state.undoDraftVertex);
  const resetDraft = useZoneStore((state) => state.resetDraft);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState(false);
  const mockMode = isMockWorkZoneEnabled();
  const mapReady = useZoneStore((state) => state.mapReady);
  const canEdit = mockMode || mapReady;

  const storedPolygon = selectedRobotId ? zonesByRobotId[selectedRobotId] : undefined;
  const currentVersion = selectedRobotId ? versionsByRobotId[selectedRobotId] ?? null : null;
  const editing = selectedRobotId ? Boolean(editingByRobotId[selectedRobotId]) : false;
  const draftVertices = selectedRobotId ? draftVerticesByRobotId[selectedRobotId] ?? [] : [];
  const polygon = editing ? closePolygonVertices(draftVertices) : storedPolygon;
  const validation = useMemo(() => validatePolygonGeometry(polygon), [polygon]);
  const visibleVertices = editing ? draftVertices : openPolygonVertices(polygon);

  useEffect(() => {
    if (!selectedRobotId) {
      return;
    }

    const sessionVersion = useAuthStore.getState().sessionVersion;
    let cancelled = false;
    setLoading(true);
    setLoadMessage(null);
    setSaveMessage(null);
    setConflict(false);

    getWorkZone(selectedRobotId)
      .then((snapshot) => {
        if (cancelled || useAuthStore.getState().sessionVersion !== sessionVersion) return;
        setZone(selectedRobotId, snapshot.geometry, snapshot.version);
        setLoadMessage(snapshot.geometry ? null : '등록된 작업 구역이 없습니다.');
      })
      .catch(() => {
        if (cancelled || useAuthStore.getState().sessionVersion !== sessionVersion) return;
        setLoadMessage('작업 구역을 불러오지 못했습니다. 연결 상태를 확인하세요.');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRobotId, setZone]);

  const handleSave = async () => {
    if (!selectedRobotId || !polygon || !validation.valid
      || (!isMockWorkZoneEnabled() && !useZoneStore.getState().mapReady)) {
      return;
    }

    setSaveMessage(null);
    const sessionVersion = useAuthStore.getState().sessionVersion;

    try {
      const response = await saveWorkZone(selectedRobotId, polygon, currentVersion);
      if (useAuthStore.getState().sessionVersion !== sessionVersion) return;
      setZone(selectedRobotId, polygon, response.version);
      setConflict(false);
      stopEditing(selectedRobotId);
      setSaveMessage(
        response.saved
          ? '작업 구역을 저장했습니다.'
          : '개발 모드 저장 요청을 확인했습니다. 실제 DB에는 저장되지 않았습니다.',
      );
    } catch (error) {
      if (useAuthStore.getState().sessionVersion !== sessionVersion) return;
      setConflict(error instanceof ApiError && error.status === 409);
      setSaveMessage(error instanceof ApiError && error.status === 409
        ? '다른 사용자가 작업 구역을 변경했습니다. 편집 내용은 유지됩니다. 최신 구역을 다시 불러온 뒤 변경 내용을 확인하고 저장하세요.'
        : '작업 구역을 저장하지 못했습니다. 편집 내용은 유지됩니다.');
    }
  };

  const handleReload = async () => {
    if (!selectedRobotId) return;
    const sessionVersion = useAuthStore.getState().sessionVersion;
    try {
      const snapshot = await getWorkZone(selectedRobotId);
      if (useAuthStore.getState().sessionVersion !== sessionVersion
        || useRobotStore.getState().selectedRobotId !== selectedRobotId) return;
      // 최신 저장본과 버전만 갱신하고 사용자가 작성한 꼭짓점은 유지한다.
      setZone(selectedRobotId, snapshot.geometry, snapshot.version);
      setConflict(false);
      setSaveMessage('최신 작업 구역을 불러왔습니다. 편집 내용은 유지됩니다. 변경 내용을 확인한 뒤 저장하세요.');
    } catch {
      if (useAuthStore.getState().sessionVersion !== sessionVersion
        || useRobotStore.getState().selectedRobotId !== selectedRobotId) return;
      setSaveMessage('최신 작업 구역을 불러오지 못했습니다. 편집 내용은 유지됩니다.');
    }
  };

  return (
    <div className="work-zone-editor">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">2단계</p>
          <h2>작업 구역(Work Zone)</h2>
        </div>
        <span className={editing ? 'status-pill degraded' : 'status-pill connected'}>
          {editing ? `편집 중 · ${draftVertices.length}점` : mockMode ? '샘플 모드' : '실제 저장 모드'}
        </span>
      </div>

      <p className="muted">
        {editing
          ? '지도에서 꼭짓점을 선택하세요'
          : mockMode
            ? '새 구역을 그리거나 샘플 구역을 불러와 편집할 수 있습니다.'
            : '저장한 작업 구역은 PostGIS에 반영되며 다시 접속해도 유지됩니다.'}
      </p>

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
          <>
            {storedPolygon ? (
              <Button
                type="button"
                variant="primary"
                disabled={!selectedRobotId || !canEdit}
                onClick={() =>
                  selectedRobotId && startEditing(selectedRobotId, openPolygonVertices(storedPolygon))
                }
              >
                기존 구역 수정
              </Button>
            ) : null}
            <Button
              type="button"
              variant={storedPolygon ? 'secondary' : 'primary'}
              disabled={!selectedRobotId || !canEdit}
              onClick={() => selectedRobotId && startEditing(selectedRobotId)}
            >
              {storedPolygon ? '새 구역 다시 그리기' : '새 구역 그리기'}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => selectedRobotId && stopEditing(selectedRobotId)}
            >
              편집 취소
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={draftVertices.length === 0}
              onClick={() => selectedRobotId && undoDraftVertex(selectedRobotId)}
            >
              마지막 점 취소
            </Button>
            {mockMode ? (
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
            ) : null}
            <Button
              type="button"
              variant="secondary"
              disabled={draftVertices.length === 0}
              onClick={() => selectedRobotId && resetDraft(selectedRobotId)}
            >
              전체 초기화
            </Button>
            {conflict ? <Button type="button" onClick={handleReload}>최신 구역 다시 불러오기</Button> : null}
            <Button type="button" variant="primary" disabled={!validation.valid || conflict || !canEdit} onClick={handleSave}>
              작업 구역 저장
            </Button>
          </>
        )}
      </div>

      {!mapReady ? <p className="warning-line">{mockMode
        ? '개발용 샘플 좌표 편집입니다. 실제 DB에는 저장하지 않습니다.'
        : '현장 지도 좌표 기준을 확인할 수 없어 편집·저장을 제한합니다. 기존 구역 조회와 편집 내용은 유지됩니다. 네이버 지도 복구 후 저장하세요.'}</p> : null}
      {loading ? <p className="save-note">작업 구역을 불러오는 중입니다.</p> : null}
      {!loading && loadMessage ? <p className="warning-line">{loadMessage}</p> : null}
      {saveMessage ? <p className="save-note">{saveMessage}</p> : null}
    </div>
  );
}
