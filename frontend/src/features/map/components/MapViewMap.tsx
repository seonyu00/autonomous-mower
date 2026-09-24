import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { env } from '../../../shared/config/env';
import { useRobotStore } from '../../robots/robotStore';
import { hasUsablePosition } from '../../telemetry/position';
import { useTelemetryStore } from '../../telemetry/telemetryStore';
import type { LngLat, PolygonGeometry } from '../geojson';
import { mockRouteByRobotId } from '../mockMapData';
import {
  appendRoutePosition,
  calculateHeadingDegrees,
  splitRouteByProgress,
} from '../routeGeometry';
import { useZoneStore } from '../zoneStore';
import {
  closePolygonVertices,
  fallbackMapBounds,
  projectFallbackPoint,
  toFallbackSvgPoint,
  type MapBounds,
} from '../workZoneEditing';
import { useCppPreview, previewMarkers } from '../cppPreview';
import { CppPreviewControls } from './CppPreviewControls';
import { NaverOperationalMap } from './NaverOperationalMap';

const emptyDraftVertices: LngLat[] = [];

export function MapViewMap() {
  const preview = useCppPreview();
  const [mapError, setMapError] = useState<string | null>(null);
  const [sessionRoutes, setSessionRoutes] = useState<Record<string, LngLat[]>>({});

  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const telemetry = useTelemetryStore((state) =>
    selectedRobotId ? state.telemetryByRobotId[selectedRobotId] : undefined,
  );
  const dataSource = useTelemetryStore((state) => state.dataSource);
  const zonesByRobotId = useZoneStore((state) => state.zonesByRobotId);
  const mapReady = useZoneStore((state) => state.mapReady);
  const setMapReady = useZoneStore((state) => state.setMapReady);
  const sampleEditing = import.meta.env.DEV && env.enableMockWorkZone;
  const handleMapError = useCallback((message: string) => {
    setMapReady(false);
    setMapError(message);
  }, [setMapReady]);
  const handleMapReady = useCallback((ready: boolean) => {
    setMapReady(ready);
    if (ready) setMapError(null);
  }, [setMapReady]);
  const draftVerticesByRobotId = useZoneStore((state) => state.draftVerticesByRobotId);
  const editingByRobotId = useZoneStore((state) => state.editingByRobotId);
  const addDraftVertex = useZoneStore((state) => state.addDraftVertex);
  const moveDraftVertex = useZoneStore((state) => state.moveDraftVertex);
  const positionAvailable = hasUsablePosition(telemetry?.latitude, telemetry?.longitude);
  const sampleMode = dataSource === 'mock';
  const livePositionAvailable = positionAvailable && !sampleMode;
  const sampleRoute = sampleMode && selectedRobotId ? mockRouteByRobotId[selectedRobotId] : undefined;
  const sampleRouteSegments = useMemo(
    () => splitRouteByProgress(sampleRoute?.geometry.coordinates ?? [], 0.38),
    [sampleRoute],
  );
  const sessionRoute = selectedRobotId ? sessionRoutes[selectedRobotId] ?? [] : [];
  const completedRoute = livePositionAvailable ? sessionRoute : sampleRouteSegments.completed;
  const plannedRoute = sampleRouteSegments.planned;
  const headingDegrees = calculateHeadingDegrees(completedRoute);
  const markerPosition = useMemo(
    () =>
      livePositionAvailable && telemetry
        ? ([telemetry.longitude, telemetry.latitude] as LngLat)
        : sampleRouteSegments.completed.at(-1),
    [livePositionAvailable, sampleRouteSegments.completed, telemetry],
  );
  const editingWorkZone = selectedRobotId ? Boolean(editingByRobotId[selectedRobotId]) : false;
  const draftVertices = selectedRobotId
    ? draftVerticesByRobotId[selectedRobotId] ?? emptyDraftVertices
    : emptyDraftVertices;
  const storedWorkZone = selectedRobotId ? zonesByRobotId[selectedRobotId] : undefined;
  const displayedWorkZone = editingWorkZone
    ? closePolygonVertices(draftVertices)
    : storedWorkZone;
  const sourceLabel = sampleMode ? '샘플 운용 데이터' : livePositionAvailable ? 'GPS 위치' : '위치 수신 대기';
  const positionStatus = !positionAvailable
    ? 'GPS 미수신'
    : sampleMode
      ? '샘플 위치'
      : 'GPS 수신';
  const directionLabel =
    headingDegrees === null
      ? '방향 계산 대기'
      : `${livePositionAvailable ? 'GPS 방향' : '샘플 방향'} ${Math.round(headingDegrees)}°`;

  useEffect(() => {
    if (!selectedRobotId || !telemetry || !livePositionAvailable) {
      return;
    }

    const position: LngLat = [telemetry.longitude, telemetry.latitude];
    setSessionRoutes((current) => ({
      ...current,
      [selectedRobotId]: appendRoutePosition(current[selectedRobotId] ?? [], position),
    }));
  }, [livePositionAvailable, selectedRobotId, telemetry]);

  return (
    <div className={`maplibre-shell ${editingWorkZone ? 'zone-editing' : ''}`}>
      <NaverOperationalMap
        clientId={env.naverMapClientId}
        robotId={selectedRobotId}
        robotMode={telemetry?.mode}
        livePositionAvailable={livePositionAvailable}
        markerPosition={markerPosition}
        headingDegrees={headingDegrees}
        workZone={displayedWorkZone}
        draftVertices={draftVertices}
        plannedRoute={preview.path.length ? [] : plannedRoute}
        previewRoute={preview.path}
        completedRoute={completedRoute}
        editing={editingWorkZone && mapReady}
        onAddVertex={(position) => {
          if (selectedRobotId && useZoneStore.getState().mapReady) {
            addDraftVertex(selectedRobotId, position);
          }
        }}
        onMoveVertex={(index, position) => {
          if (selectedRobotId && useZoneStore.getState().mapReady) {
            moveDraftVertex(selectedRobotId, index, position);
          }
        }}
        onError={handleMapError}
        onReadyChange={handleMapReady}
      />
      {mapError ? (
        <>
          <FallbackMapLayer
            robotId={selectedRobotId}
            sampleMode={sampleMode && !preview.path.length}
            previewRoute={preview.path}
            headingDegrees={headingDegrees}
            workZone={sampleEditing ? displayedWorkZone : storedWorkZone}
            draftVertices={sampleEditing ? draftVertices : []}
            editing={editingWorkZone && sampleEditing}
            sampleEditing={sampleEditing}
            onAddVertex={(position) => {
              if (selectedRobotId && sampleEditing) {
                addDraftVertex(selectedRobotId, position);
              }
            }}
            onMoveVertex={(index, position) => {
              if (selectedRobotId && sampleEditing) {
                moveDraftVertex(selectedRobotId, index, position);
              }
            }}
          />
          <div className="map-fallback-warning" role="alert">
            <span>Fallback 지도 표시 중</span>
            <strong>{mapError}</strong>
            <span>{sampleEditing ? '개발용 샘플 좌표 편집 · 실제 DB 저장 안 함' : '저장 구역 좌표 도식 · 실제 배경 지도 아님 · 편집 및 저장 불가'}</span>
          </div>
        </>
      ) : null}
      <CppPreviewControls preview={preview} />
      <span className={livePositionAvailable ? 'map-data-source-chip live' : 'map-data-source-chip sample'}>
        {sourceLabel}
      </span>
      <div className="map-operation-strip" aria-label="지도 운용 정보">
        <div className="map-operation-primary">
          <span className="map-operation-label">선택 장비</span>
          <strong>{selectedRobotId ?? '로봇 없음'}</strong>
        </div>
        <div className="map-operation-item">
          <span>현재 좌표</span>
          <strong>
            {telemetry && positionAvailable
              ? `${telemetry.latitude.toFixed(5)}, ${telemetry.longitude.toFixed(5)}`
              : '위치 수신 대기'}
          </strong>
        </div>
        <div className="map-operation-item">
          <span>GPS / RTK</span>
          <strong>{positionStatus}</strong>
        </div>
        <div className="map-operation-item">
          <span>진행 방향</span>
          <strong>{directionLabel}</strong>
        </div>
      </div>
      <div className="map-legend" aria-label="지도 범례">
        <span><i className="legend-line completed" />{sampleMode ? '샘플 완료 경로' : '세션 완료 경로'}</span>
        {preview.path.length ? <span><i className="legend-line planned" />CPP 예정 경로 · 시작 → 번호 → 끝</span> : sampleMode ? <span><i className="legend-line planned" />샘플 예정 경로</span> : null}
        <span><i className="legend-area" />작업 구역</span>
      </div>
    </div>
  );
}

function FallbackMapLayer({
  previewRoute,
  robotId,
  sampleMode,
  headingDegrees,
  workZone,
  draftVertices,
  editing,
  sampleEditing,
  onAddVertex,
  onMoveVertex,
}: {
  previewRoute: LngLat[];
  robotId: string | null;
  sampleMode: boolean;
  headingDegrees: number | null;
  workZone: PolygonGeometry | null | undefined;
  draftVertices: LngLat[];
  editing: boolean;
  sampleEditing: boolean;
  onAddVertex: (position: LngLat) => void;
  onMoveVertex: (index: number, position: LngLat) => void;
}) {
  const bounds = sampleEditing ? fallbackMapBounds : storedZoneBounds(workZone);
  const workZonePath = toFallbackPath(workZone, bounds);
  const draggingVertexIndexRef = useRef<number | null>(null);
  const suppressNextClickRef = useRef(false);

  return (
    <div className="map-fallback-layer" aria-label="지도 대체 운용 화면">
      <svg
        viewBox="0 0 1000 620"
        preserveAspectRatio="none"
        aria-label={editing ? '작업 구역 편집 지도' : previewRoute.length ? 'CPP 예정 경로 좌표 도식' : undefined}
        aria-hidden={editing || previewRoute.length ? undefined : true}
        className={editing ? 'zone-editing' : undefined}
        onClick={(event) => {
          if (!editing) {
            return;
          }

          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            return;
          }

          onAddVertex(projectFallbackPoint(event, event.currentTarget.getBoundingClientRect()));
        }}
        onPointerMove={(event) => {
          const index = draggingVertexIndexRef.current;

          if (!editing || index === null) {
            return;
          }

          event.preventDefault();
          onMoveVertex(index, projectFallbackPoint(event, event.currentTarget.getBoundingClientRect()));
        }}
        onPointerUp={() => {
          draggingVertexIndexRef.current = null;
        }}
        onPointerCancel={() => {
          draggingVertexIndexRef.current = null;
        }}
      >
        <defs>
          <pattern id="fallback-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" className="fallback-grid-line" />
          </pattern>
        </defs>
        <rect width="1000" height="620" className="fallback-map-ground" />
        <rect width="1000" height="620" fill="url(#fallback-grid)" />
        {workZonePath ? <path className="fallback-work-zone" d={workZonePath} /> : null}
        {previewRoute.length > 0 && <g aria-label="CPP 예정 경로">
          <polyline fill="none" stroke="#61b6ff" strokeWidth="3" points={previewRoute.map((point) => toFallbackSvgPoint(point, bounds).join(',')).join(' ')} />
          {previewMarkers(previewRoute).map(({ position, index, label }) => {
            const [x, y] = toFallbackSvgPoint(position, bounds);
            const next = previewRoute[index + 1];
            const target = next ? toFallbackSvgPoint(next, bounds) : null;
            const angle = target ? Math.atan2(target[1] - y, target[0] - x) * 180 / Math.PI : 0;
            return <g key={index} aria-label={`예정 경로 ${label}`}>
              <circle cx={x} cy={y} r="5" fill={index === 0 ? '#49d37b' : '#61b6ff'} />
              {target && <path d="M-5 -4 L5 0 L-5 4" fill="none" stroke="#fff" strokeWidth="2" transform={`translate(${x} ${y}) rotate(${angle})`} />}
              <text x={x + 7} y={y - 8} fill="#fff" fontSize="14" stroke="#172234" strokeWidth="3" paintOrder="stroke">{label}</text>
            </g>;
          })}
        </g>}
        {draftVertices.map((position, index) => {
          const [x, y] = toFallbackSvgPoint(position, bounds);

          return (
            <circle
              key={`${position[0]}-${position[1]}-${index}`}
              className="fallback-work-zone-vertex"
              aria-label={`작업 구역 꼭짓점 ${index + 1}`}
              cx={x}
              cy={y}
              r="7"
              onPointerDown={(event) => {
                if (!editing) return;
                event.stopPropagation();
                draggingVertexIndexRef.current = index;
                suppressNextClickRef.current = true;
                event.currentTarget.setPointerCapture?.(event.pointerId);
              }}
            />
          );
        })}
        {sampleMode ? (
          <>
            <path
              className="fallback-route-planned"
              d="M225 445 C310 395 330 220 430 170 C535 120 690 165 770 250 C825 310 760 390 650 420 C515 460 380 430 280 360"
            />
            <path
              className="fallback-route-complete"
              d="M225 445 C310 395 330 220 430 170 C500 136 570 140 625 158"
            />
          </>
        ) : null}
      </svg>
      {workZone || sampleEditing ? <span className="fallback-zone-label" aria-label="대체 작업 구역">
        {sampleEditing ? '샘플 작업 구역' : '저장된 작업 구역 · 좌표 도식'}
      </span> : null}
      {sampleMode ? (
        <>
          <span className="fallback-route-label" aria-label="대체 샘플 경로">샘플 완료·예정 경로</span>
          <div
            className="fallback-robot-marker sample"
            aria-label="대체 로봇 위치"
            style={{ '--marker-heading': `${headingDegrees ?? 0}deg` } as CSSProperties}
          >
            <i aria-hidden="true" />
            <strong>{robotId ?? '로봇 없음'} · 샘플</strong>
          </div>
        </>
      ) : null}
    </div>
  );
}

function storedZoneBounds(polygon: PolygonGeometry | null | undefined): MapBounds {
  const ring = polygon?.coordinates[0] ?? [];
  if (!ring.length) return fallbackMapBounds;
  const longitudes = ring.map(([longitude]) => longitude);
  const latitudes = ring.map(([, latitude]) => latitude);
  const west = Math.min(...longitudes), east = Math.max(...longitudes);
  const south = Math.min(...latitudes), north = Math.max(...latitudes);
  const paddingX = Math.max((east - west) * 0.1, 0.00001);
  const paddingY = Math.max((north - south) * 0.1, 0.00001);
  return { west: west - paddingX, east: east + paddingX, south: south - paddingY, north: north + paddingY };
}

function toFallbackPath(polygon: PolygonGeometry | null | undefined, bounds: MapBounds) {
  const ring = polygon?.coordinates[0] ?? [];

  if (ring.length === 0) {
    return null;
  }

  return ring
    .map((position, index) => {
      const [x, y] = toFallbackSvgPoint(position, bounds);
      return `${index === 0 ? 'M' : 'L'}${x} ${y}`;
    })
    .join(' ');
}
