import { useEffect, useMemo, useRef, useState } from 'react';
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
} from '../workZoneEditing';
import { NaverOperationalMap } from './NaverOperationalMap';

const emptyDraftVertices: LngLat[] = [];

export function MapViewMap() {
  const [mapError, setMapError] = useState<string | null>(null);
  const [sessionRoutes, setSessionRoutes] = useState<Record<string, LngLat[]>>({});

  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const telemetry = useTelemetryStore((state) =>
    selectedRobotId ? state.telemetryByRobotId[selectedRobotId] : undefined,
  );
  const realtimeConnectionState = useTelemetryStore((state) => state.connectionState);
  const zonesByRobotId = useZoneStore((state) => state.zonesByRobotId);
  const draftVerticesByRobotId = useZoneStore((state) => state.draftVerticesByRobotId);
  const editingByRobotId = useZoneStore((state) => state.editingByRobotId);
  const addDraftVertex = useZoneStore((state) => state.addDraftVertex);
  const moveDraftVertex = useZoneStore((state) => state.moveDraftVertex);
  const positionAvailable = hasUsablePosition(telemetry?.latitude, telemetry?.longitude);
  const sampleMode = realtimeConnectionState === 'mock' || !positionAvailable;
  const livePositionAvailable = positionAvailable && !sampleMode;
  const sampleRoute = selectedRobotId ? mockRouteByRobotId[selectedRobotId] : undefined;
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
  const sourceLabel = livePositionAvailable ? 'GPS 위치 · 샘플 예정 경로' : '샘플 운용 데이터';
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
        plannedRoute={plannedRoute}
        completedRoute={completedRoute}
        editing={editingWorkZone}
        onAddVertex={(position) => {
          if (selectedRobotId) {
            addDraftVertex(selectedRobotId, position);
          }
        }}
        onMoveVertex={(index, position) => {
          if (selectedRobotId) {
            moveDraftVertex(selectedRobotId, index, position);
          }
        }}
        onError={setMapError}
      />
      {mapError ? (
        <>
          <FallbackMapLayer
            robotId={selectedRobotId}
            positionAvailable={livePositionAvailable}
            headingDegrees={headingDegrees}
            workZone={displayedWorkZone}
            draftVertices={draftVertices}
            editing={editingWorkZone}
            onAddVertex={(position) => {
              if (selectedRobotId) {
                addDraftVertex(selectedRobotId, position);
              }
            }}
            onMoveVertex={(index, position) => {
              if (selectedRobotId) {
                moveDraftVertex(selectedRobotId, index, position);
              }
            }}
          />
          <div className="map-fallback-warning" role="alert">
            <span>Fallback 지도 표시 중</span>
            <strong>{mapError}</strong>
          </div>
        </>
      ) : null}
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
        <span><i className="legend-line completed" />{livePositionAvailable ? '세션 완료 경로' : '샘플 완료 경로'}</span>
        <span><i className="legend-line planned" />샘플 예정 경로</span>
        <span><i className="legend-area" />작업 구역</span>
      </div>
    </div>
  );
}

function FallbackMapLayer({
  robotId,
  positionAvailable,
  headingDegrees,
  workZone,
  draftVertices,
  editing,
  onAddVertex,
  onMoveVertex,
}: {
  robotId: string | null;
  positionAvailable: boolean;
  headingDegrees: number | null;
  workZone: PolygonGeometry | null | undefined;
  draftVertices: LngLat[];
  editing: boolean;
  onAddVertex: (position: LngLat) => void;
  onMoveVertex: (index: number, position: LngLat) => void;
}) {
  const workZonePath = toFallbackPath(workZone);
  const draggingVertexIndexRef = useRef<number | null>(null);
  const suppressNextClickRef = useRef(false);

  return (
    <div className="map-fallback-layer" aria-label="지도 대체 운용 화면">
      <svg
        viewBox="0 0 1000 620"
        preserveAspectRatio="none"
        aria-label={editing ? '작업 구역 편집 지도' : undefined}
        aria-hidden={editing ? undefined : true}
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

          if (index === null) {
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
        {draftVertices.map((position, index) => {
          const [x, y] = toFallbackSvgPoint(position, fallbackMapBounds);

          return (
            <circle
              key={`${position[0]}-${position[1]}-${index}`}
              className="fallback-work-zone-vertex"
              aria-label={`작업 구역 꼭짓점 ${index + 1}`}
              cx={x}
              cy={y}
              r="7"
              onPointerDown={(event) => {
                event.stopPropagation();
                draggingVertexIndexRef.current = index;
                suppressNextClickRef.current = true;
                event.currentTarget.setPointerCapture?.(event.pointerId);
              }}
            />
          );
        })}
        <path
          className="fallback-route-planned"
          d="M225 445 C310 395 330 220 430 170 C535 120 690 165 770 250 C825 310 760 390 650 420 C515 460 380 430 280 360"
        />
        <path
          className="fallback-route-complete"
          d="M225 445 C310 395 330 220 430 170 C500 136 570 140 625 158"
        />
      </svg>
      <span className="fallback-zone-label" aria-label="대체 작업 구역">샘플 작업 구역</span>
      <span className="fallback-route-label" aria-label="대체 샘플 경로">샘플 완료·예정 경로</span>
      <div
        className={positionAvailable ? 'fallback-robot-marker live' : 'fallback-robot-marker sample'}
        aria-label="대체 로봇 위치"
        style={{ '--marker-heading': `${headingDegrees ?? 0}deg` } as CSSProperties}
      >
        <i aria-hidden="true" />
        <strong>
          {robotId ?? '로봇 없음'}
          {positionAvailable ? '' : ' · 샘플'}
        </strong>
      </div>
    </div>
  );
}

function toFallbackPath(polygon: PolygonGeometry | null | undefined) {
  const ring = polygon?.coordinates[0] ?? [];

  if (ring.length === 0) {
    return null;
  }

  return ring
    .map((position, index) => {
      const [x, y] = toFallbackSvgPoint(position, fallbackMapBounds);
      return `${index === 0 ? 'M' : 'L'}${x} ${y}`;
    })
    .join(' ');
}
