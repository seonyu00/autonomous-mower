import { useEffect, useMemo, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { HistoryEntry } from '../types';

const emptyFeatureCollection: FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

type HistoryMapProps = {
  selectedEntry: HistoryEntry | null;
};

export function HistoryMap({ selectedEntry }: HistoryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const eventFeatures = useMemo<Feature<Point>[]>(() => {
    return selectedEntry?.events.flatMap((event) => (event.location ? [event.location] : [])) ?? [];
  }, [selectedEntry]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [127.4564, 36.6285],
      zoom: 15,
      attributionControl: false,
    });

    mapRef.current.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    mapRef.current.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    mapRef.current.on('load', () => {
      const map = mapRef.current;

      if (!map) {
        return;
      }

      map.addSource('history-route', {
        type: 'geojson',
        data: emptyFeatureCollection,
      });
      map.addLayer({
        id: 'history-route-line',
        type: 'line',
        source: 'history-route',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#f5c542',
          'line-width': 5,
        },
      });

      map.addSource('history-events', {
        type: 'geojson',
        data: emptyFeatureCollection,
      });
      map.addLayer({
        id: 'history-event-points',
        type: 'circle',
        source: 'history-events',
        paint: {
          'circle-color': '#ff5664',
          'circle-radius': 7,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    const updateSources = () => {
      const routeSource = map.getSource('history-route') as maplibregl.GeoJSONSource | undefined;
      const eventSource = map.getSource('history-events') as maplibregl.GeoJSONSource | undefined;

      routeSource?.setData(toFeatureCollection(selectedEntry?.route));
      eventSource?.setData({
        type: 'FeatureCollection',
        features: eventFeatures,
      });

      const coordinates = selectedEntry?.route.geometry.coordinates;

      if (coordinates?.length) {
        const first = coordinates[0] as [number, number];
        const bounds = coordinates.reduce(
          (currentBounds, coordinate) => currentBounds.extend(coordinate as [number, number]),
          new maplibregl.LngLatBounds(first, first),
        );

        map.fitBounds(bounds, {
          padding: 52,
          duration: 500,
        });
      }
    };

    if (map.isStyleLoaded()) {
      updateSources();
    } else {
      map.once('load', updateSources);
    }
  }, [eventFeatures, selectedEntry]);

  return (
    <div className="history-map-shell">
      <div ref={mapContainerRef} className="maplibre-container" />
      <div className="map-readout">
        <strong>{selectedEntry?.robotId ?? '선택된 이력 없음'}</strong>
        <span>{selectedEntry ? `${selectedEntry.distanceMeters} m 경로` : '작업 기록을 선택하면 경로 데이터를 볼 수 있습니다.'}</span>
        <small>읽기 전용 과거 LineString 및 이벤트 지점 레이어입니다.</small>
      </div>
    </div>
  );
}

function toFeatureCollection(feature?: Feature<LineString>): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: feature ? [feature] : [],
  };
}
