import { useEffect, useRef, useState } from 'react';
import { env } from '../../../shared/config/env';
import { DEFAULT_MAP_CENTER, MAX_OPERATIONAL_MAP_ZOOM } from '../../map/mapDefaults';
import { loadNaverMaps } from '../../map/naverMapsLoader';
import type { HistoryEntry, HistoryEventSeverity } from '../types';

type HistoryMapProps = {
  selectedEntry: HistoryEntry | null;
};

export function HistoryMap({ selectedEntry }: HistoryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const overlaysRef = useRef<Array<naver.maps.Polyline | naver.maps.Marker>>([]);
  const [mapsApi, setMapsApi] = useState<typeof naver.maps | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadNaverMaps(env.naverMapClientId)
      .then((maps) => {
        if (cancelled || !mapContainerRef.current) {
          return;
        }

        const map = new maps.Map(mapContainerRef.current, {
          center: new maps.LatLng(DEFAULT_MAP_CENTER[1], DEFAULT_MAP_CENTER[0]),
          zoom: 16,
          maxZoom: MAX_OPERATIONAL_MAP_ZOOM,
          mapTypeId: maps.MapTypeId.SATELLITE,
          zoomControl: true,
          zoomControlOptions: {
            position: maps.Position.TOP_RIGHT,
          },
        });
        mapRef.current = map;
        setMapsApi(maps);
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        setMapError(`이력 지도를 초기화하지 못했습니다. ${reason}`);
      });

    return () => {
      cancelled = true;
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];
      mapRef.current?.destroy();
      mapRef.current = null;
      setMapsApi(null);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapsApi || !map) {
      return;
    }

    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];

    const coordinates = selectedEntry?.route.geometry.coordinates ?? [];

    if (coordinates.length > 1) {
      overlaysRef.current.push(
        new mapsApi.Polyline({
          map,
          path: coordinates.map(
            ([longitude, latitude]) => new mapsApi.LatLng(latitude, longitude),
          ),
          strokeColor: '#f5c542',
          strokeOpacity: 1,
          strokeWeight: 5,
        }),
      );
    }

    selectedEntry?.events.forEach((event) => {
      const coordinate = event.location?.geometry.coordinates;

      if (!coordinate) {
        return;
      }

      overlaysRef.current.push(
        new mapsApi.Marker({
          map,
          position: new mapsApi.LatLng(coordinate[1], coordinate[0]),
          title: event.message,
          icon: {
            content: createEventMarker(event.severity),
            anchor: { x: 7, y: 7 },
          },
        }),
      );
    });

    if (coordinates.length) {
      const first = coordinates[0];
      const firstPosition = new mapsApi.LatLng(first[1], first[0]);
      const bounds = new mapsApi.LatLngBounds(firstPosition, firstPosition);
      coordinates.slice(1).forEach(([longitude, latitude]) => {
        bounds.extend(new mapsApi.LatLng(latitude, longitude));
      });
      map.fitBounds(bounds, {
        top: 52,
        right: 52,
        bottom: 52,
        left: 52,
        maxZoom: 18,
      });
    }
  }, [mapsApi, selectedEntry]);

  return (
    <div className="history-map-shell">
      <div
        ref={mapContainerRef}
        className="maplibre-container"
        aria-label="네이버 위성 작업 이력 지도"
        style={{ width: '100%', height: '100%' }}
      />
      {mapError ? <div className="map-fallback-warning" role="alert">{mapError}</div> : null}
      <div className="map-readout">
        <strong>{selectedEntry?.robotId ?? '선택된 이력 없음'}</strong>
        <span>{selectedEntry ? `${selectedEntry.distanceMeters} m 경로` : '작업 기록을 선택하면 경로 데이터를 볼 수 있습니다.'}</span>
        <small>읽기 전용 과거 경로와 이벤트 위치를 네이버 위성 지도에 표시합니다.</small>
      </div>
    </div>
  );
}

function createEventMarker(severity: HistoryEventSeverity) {
  const marker = document.createElement('span');
  marker.className = `history-event-marker ${severity}`;
  marker.setAttribute('aria-hidden', 'true');
  return marker;
}
