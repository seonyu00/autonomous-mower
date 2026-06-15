import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useRobotStore } from '../../robots/robotStore';
import { hasUsablePosition } from '../../telemetry/position';
import { useTelemetryStore } from '../../telemetry/telemetryStore';
import type { LngLat, PolygonGeometry } from '../geojson';
import { mockRouteByRobotId, mockWorkZoneByRobotId } from '../mockMapData';
import {
  appendRoutePosition,
  calculateHeadingDegrees,
  splitRouteByProgress,
  toLineFeature,
} from '../routeGeometry';
import { useZoneStore } from '../zoneStore';
import {
  closePolygonVertices,
  fallbackMapBounds,
  projectFallbackPoint,
  toFallbackSvgPoint,
} from '../workZoneEditing';

const emptyFeatureCollection: FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};
const emptyDraftVertices: LngLat[] = [];

export function MapViewMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
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
  const storedWorkZone = selectedRobotId
    ? zonesByRobotId[selectedRobotId] ?? mockWorkZoneByRobotId[selectedRobotId]?.geometry
    : undefined;
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

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    try {
      mapRef.current = new maplibregl.Map({
        container: mapContainerRef.current,
        style: 'https://demotiles.maplibre.org/style.json',
        center: [127.4564, 36.6285],
        zoom: 16,
        attributionControl: false,
      });
    } catch {
      setMapError('지도를 초기화하지 못했습니다.');
      return;
    }

    mapRef.current.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    mapRef.current.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    mapRef.current.on('error', () => {
      setMapError('지도 스타일을 불러오지 못했습니다.');
    });

    mapRef.current.on('load', () => {
      const map = mapRef.current;

      if (!map) {
        return;
      }

      map.addSource('work-zone', {
        type: 'geojson',
        data: emptyFeatureCollection,
      });
      map.addLayer({
        id: 'work-zone-fill',
        type: 'fill',
        source: 'work-zone',
        paint: {
          'fill-color': '#49d37b',
          'fill-opacity': 0.18,
        },
      });
      map.addLayer({
        id: 'work-zone-outline',
        type: 'line',
        source: 'work-zone',
        paint: {
          'line-color': '#49d37b',
          'line-width': 3,
        },
      });
      map.addSource('work-zone-vertices', {
        type: 'geojson',
        data: emptyFeatureCollection,
      });
      map.addLayer({
        id: 'work-zone-vertices-circle',
        type: 'circle',
        source: 'work-zone-vertices',
        paint: {
          'circle-color': '#f5a524',
          'circle-radius': 6,
          'circle-stroke-color': '#0e1113',
          'circle-stroke-width': 2,
        },
      });

      map.addSource('route-planned', {
        type: 'geojson',
        data: emptyFeatureCollection,
      });
      map.addLayer({
        id: 'route-planned-line',
        type: 'line',
        source: 'route-planned',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#61b6ff',
          'line-width': 4,
          'line-dasharray': [2, 2],
        },
      });

      map.addSource('route-completed', {
        type: 'geojson',
        data: emptyFeatureCollection,
      });
      map.addLayer({
        id: 'route-completed-line',
        type: 'line',
        source: 'route-completed',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#49d37b',
          'line-width': 5,
        },
      });
    });

    return () => {
      markerRef.current?.remove();
      mapRef.current?.remove();
      markerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !selectedRobotId || !editingWorkZone) {
      return;
    }

    const handleMapClick = (event: maplibregl.MapMouseEvent) => {
      addDraftVertex(selectedRobotId, [event.lngLat.lng, event.lngLat.lat]);
    };

    map.on('click', handleMapClick);

    return () => {
      map.off('click', handleMapClick);
    };
  }, [addDraftVertex, editingWorkZone, selectedRobotId]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !selectedRobotId || !markerPosition) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (!markerRef.current) {
      const markerElement = document.createElement('div');
      markerElement.className = 'maplibre-robot-marker';
      markerElement.append(document.createElement('i'));
      markerRef.current = new maplibregl.Marker({ element: markerElement }).setLngLat(markerPosition).addTo(map);
    } else {
      markerRef.current.setLngLat(markerPosition);
    }

    const markerElement = markerRef.current.getElement();
    markerElement.className = `maplibre-robot-marker ${livePositionAvailable ? telemetry?.mode ?? 'idle' : 'sample'}`;
    markerElement.setAttribute(
      'aria-label',
      livePositionAvailable ? `${selectedRobotId} 실제 위치` : `${selectedRobotId} 샘플 위치`,
    );
    markerElement.style.setProperty('--marker-heading', `${headingDegrees ?? 0}deg`);

    if (livePositionAvailable) {
      map.easeTo({
        center: markerPosition,
        duration: 500,
        essential: true,
      });
    }
  }, [headingDegrees, livePositionAvailable, markerPosition, selectedRobotId, telemetry?.mode]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !selectedRobotId) {
      return;
    }

    const updateSources = () => {
      const zoneSource = map.getSource('work-zone') as maplibregl.GeoJSONSource | undefined;
      const vertexSource = map.getSource('work-zone-vertices') as maplibregl.GeoJSONSource | undefined;
      const plannedRouteSource = map.getSource('route-planned') as maplibregl.GeoJSONSource | undefined;
      const completedRouteSource = map.getSource('route-completed') as maplibregl.GeoJSONSource | undefined;

      zoneSource?.setData(
        toFeatureCollection(toPolygonFeature(selectedRobotId, displayedWorkZone)),
      );
      vertexSource?.setData(toPointFeatureCollection(selectedRobotId, draftVertices));
      plannedRouteSource?.setData(
        toFeatureCollection(toLineFeature(selectedRobotId, plannedRoute, 'planned')),
      );
      completedRouteSource?.setData(
        toFeatureCollection(toLineFeature(selectedRobotId, completedRoute, 'completed')),
      );
    };

    if (map.isStyleLoaded()) {
      updateSources();
    } else {
      map.once('load', updateSources);
    }
  }, [completedRoute, displayedWorkZone, draftVertices, plannedRoute, selectedRobotId]);

  return (
    <div className={`maplibre-shell ${editingWorkZone ? 'zone-editing' : ''}`}>
      <div ref={mapContainerRef} className="maplibre-container" />
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
}: {
  robotId: string | null;
  positionAvailable: boolean;
  headingDegrees: number | null;
  workZone: PolygonGeometry | null | undefined;
  draftVertices: LngLat[];
  editing: boolean;
  onAddVertex: (position: LngLat) => void;
}) {
  const workZonePath = toFallbackPath(workZone);

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

          onAddVertex(projectFallbackPoint(event, event.currentTarget.getBoundingClientRect()));
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
              cx={x}
              cy={y}
              r="7"
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

function toFeatureCollection(
  feature?: Feature<Polygon> | Feature<LineString> | Feature<Point>,
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: feature ? [feature] : [],
  };
}

function toPolygonFeature(
  robotId: string,
  geometry: PolygonGeometry | null | undefined,
): Feature<Polygon> | undefined {
  if (!geometry) {
    return undefined;
  }

  return {
    type: 'Feature',
    properties: {
      robotId,
    },
    geometry,
  };
}

function toPointFeatureCollection(robotId: string, positions: LngLat[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: positions.map((coordinates, index) => ({
      type: 'Feature',
      properties: {
        robotId,
        index,
      },
      geometry: {
        type: 'Point',
        coordinates,
      },
    })),
  };
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
