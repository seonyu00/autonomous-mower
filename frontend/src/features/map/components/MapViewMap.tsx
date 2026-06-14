import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useRobotStore } from '../../robots/robotStore';
import { hasUsablePosition } from '../../telemetry/position';
import { useTelemetryStore } from '../../telemetry/telemetryStore';
import { mockRouteByRobotId, mockWorkZoneByRobotId } from '../mockMapData';

const emptyFeatureCollection: FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

export function MapViewMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const telemetry = useTelemetryStore((state) =>
    selectedRobotId ? state.telemetryByRobotId[selectedRobotId] : undefined,
  );
  const positionAvailable = hasUsablePosition(telemetry?.latitude, telemetry?.longitude);

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

      map.addSource('robot-route', {
        type: 'geojson',
        data: emptyFeatureCollection,
      });
      map.addLayer({
        id: 'robot-route-line',
        type: 'line',
        source: 'robot-route',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#61b6ff',
          'line-width': 4,
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

    if (!map || !selectedRobotId || !telemetry || !positionAvailable) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const position: [number, number] = [telemetry.longitude, telemetry.latitude];

    if (!markerRef.current) {
      const markerElement = document.createElement('div');
      markerElement.className = `maplibre-robot-marker ${telemetry.mode}`;
      markerRef.current = new maplibregl.Marker({ element: markerElement }).setLngLat(position).addTo(map);
    } else {
      markerRef.current.setLngLat(position);
      markerRef.current.getElement().className = `maplibre-robot-marker ${telemetry.mode}`;
    }

    map.easeTo({
      center: position,
      duration: 500,
      essential: true,
    });
  }, [positionAvailable, selectedRobotId, telemetry]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !selectedRobotId) {
      return;
    }

    const updateSources = () => {
      const zoneSource = map.getSource('work-zone') as maplibregl.GeoJSONSource | undefined;
      const routeSource = map.getSource('robot-route') as maplibregl.GeoJSONSource | undefined;

      zoneSource?.setData(toFeatureCollection(mockWorkZoneByRobotId[selectedRobotId]));
      routeSource?.setData(toFeatureCollection(mockRouteByRobotId[selectedRobotId]));
    };

    if (map.isStyleLoaded()) {
      updateSources();
    } else {
      map.once('load', updateSources);
    }
  }, [selectedRobotId]);

  return (
    <div className="maplibre-shell">
      <div ref={mapContainerRef} className="maplibre-container" />
      {mapError ? (
        <>
          <FallbackMapLayer robotId={selectedRobotId} />
          <div className="map-fallback-warning" role="alert">
            <span>Fallback 지도 표시 중</span>
            <strong>{mapError}</strong>
          </div>
        </>
      ) : null}
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
          <strong>{positionAvailable ? 'GPS 수신' : 'GPS 미수신'}</strong>
        </div>
        <div className="map-operation-item">
          <span>진행 방향</span>
          <strong>연동 예정</strong>
        </div>
      </div>
      <div className="map-legend" aria-label="지도 범례">
        <span><i className="legend-line planned" />샘플 경로</span>
        <span><i className="legend-area" />작업 구역</span>
      </div>
    </div>
  );
}

function FallbackMapLayer({ robotId }: { robotId: string | null }) {
  return (
    <div className="map-fallback-layer" aria-label="지도 대체 운용 화면">
      <svg viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern id="fallback-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" className="fallback-grid-line" />
          </pattern>
        </defs>
        <rect width="1000" height="620" className="fallback-map-ground" />
        <rect width="1000" height="620" fill="url(#fallback-grid)" />
        <path
          className="fallback-work-zone"
          d="M180 135 L720 105 L855 265 L760 500 L260 520 L130 350 Z"
        />
        <path
          className="fallback-route-planned"
          d="M225 445 C310 395 330 220 430 170 C535 120 690 165 770 250 C825 310 760 390 650 420 C515 460 380 430 280 360"
        />
        <path
          className="fallback-route-complete"
          d="M225 445 C310 395 330 220 430 170 C500 136 570 140 625 158"
        />
      </svg>
      <span className="fallback-zone-label" aria-label="대체 작업 구역">작업 구역 · 4,280 m²</span>
      <span className="fallback-route-label" aria-label="대체 샘플 경로">샘플 경로 · 38% 완료</span>
      <div className="fallback-robot-marker" aria-label="대체 로봇 위치">
        <i aria-hidden="true" />
        <strong>{robotId ?? '로봇 없음'}</strong>
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
