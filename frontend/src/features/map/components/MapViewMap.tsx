import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useRobotStore } from '../../robots/robotStore';
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

  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const telemetry = useTelemetryStore((state) =>
    selectedRobotId ? state.telemetryByRobotId[selectedRobotId] : undefined,
  );

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [127.4564, 36.6285],
      zoom: 16,
      attributionControl: false,
    });

    mapRef.current.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    mapRef.current.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

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

    if (!map || !selectedRobotId || !telemetry) {
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
  }, [selectedRobotId, telemetry]);

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
      <div className="map-readout">
        <strong>{selectedRobotId ?? '로봇 없음'}</strong>
        <span>
          {telemetry ? `${telemetry.latitude.toFixed(5)}, ${telemetry.longitude.toFixed(5)}` : '텔레메트리(Telemetry) 없음'}
        </span>
        <small>샘플 마커, 경로 폴리라인, 읽기 전용 작업 구역(Work Zone) Polygon을 표시합니다.</small>
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
