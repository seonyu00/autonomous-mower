import { useEffect, useRef, useState } from 'react';
import type { LngLat, PolygonGeometry } from '../geojson';
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  MAX_OPERATIONAL_MAP_ZOOM,
} from '../mapDefaults';
import { loadNaverMaps } from '../naverMapsLoader';

type NaverOperationalMapProps = {
  clientId: string;
  robotId: string | null;
  robotMode?: string;
  livePositionAvailable: boolean;
  markerPosition?: LngLat;
  headingDegrees: number | null;
  workZone: PolygonGeometry | null | undefined;
  draftVertices: LngLat[];
  plannedRoute: LngLat[];
  completedRoute: LngLat[];
  editing: boolean;
  onAddVertex: (position: LngLat) => void;
  onMoveVertex: (index: number, position: LngLat) => void;
  onError: (message: string) => void;
};

export function NaverOperationalMap({
  clientId,
  robotId,
  robotMode,
  livePositionAvailable,
  markerPosition,
  headingDegrees,
  workZone,
  draftVertices,
  plannedRoute,
  completedRoute,
  editing,
  onAddVertex,
  onMoveVertex,
  onError,
}: NaverOperationalMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const [mapsApi, setMapsApi] = useState<typeof naver.maps | null>(null);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;

    loadNaverMaps(clientId)
      .then((maps) => {
        if (cancelled || !containerRef.current) {
          return;
        }

        try {
          const map = new maps.Map(containerRef.current, {
            center: toLatLng(maps, DEFAULT_MAP_CENTER),
            zoom: DEFAULT_MAP_ZOOM,
            maxZoom: MAX_OPERATIONAL_MAP_ZOOM,
            mapTypeId: maps.MapTypeId.SATELLITE,
            zoomControl: true,
            zoomControlOptions: {
              position: maps.Position.TOP_RIGHT,
            },
          });
          mapRef.current = map;
          setMapsApi(maps);
        } catch (error) {
          onErrorRef.current(toMapErrorMessage(error));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          onErrorRef.current(toMapErrorMessage(error));
        }
      });

    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
      setMapsApi(null);
    };
  }, [clientId]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapsApi || !map || !editing) {
      return;
    }

    const listener = mapsApi.Event.addListener(
      map,
      'click',
      (event: naver.maps.PointerEvent) => {
        onAddVertex(toLngLat(event.coord as naver.maps.LatLng));
      },
    );

    return () => mapsApi.Event.removeListener(listener);
  }, [editing, mapsApi, onAddVertex]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapsApi || !map || !workZone) {
      return;
    }

    const polygon = new mapsApi.Polygon({
      map,
      paths: workZone.coordinates.map((ring) => ring.map((position) => toLatLng(mapsApi, position))),
      strokeColor: '#49d37b',
      strokeOpacity: 1,
      strokeWeight: 3,
      fillColor: '#49d37b',
      fillOpacity: 0.18,
      clickable: false,
    });

    return () => polygon.setMap(null);
  }, [mapsApi, workZone]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapsApi || !map) {
      return;
    }

    const overlays = [
      plannedRoute.length > 1
        ? new mapsApi.Polyline({
            map,
            path: plannedRoute.map((position) => toLatLng(mapsApi, position)),
            strokeColor: '#61b6ff',
            strokeOpacity: 0.9,
            strokeWeight: 4,
            strokeStyle: 'shortdash',
          })
        : null,
      completedRoute.length > 1
        ? new mapsApi.Polyline({
            map,
            path: completedRoute.map((position) => toLatLng(mapsApi, position)),
            strokeColor: '#49d37b',
            strokeOpacity: 1,
            strokeWeight: 5,
          })
        : null,
    ].filter((overlay): overlay is naver.maps.Polyline => overlay !== null);

    return () => overlays.forEach((overlay) => overlay.setMap(null));
  }, [completedRoute, mapsApi, plannedRoute]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapsApi || !map || !editing) {
      return;
    }

    const listeners: naver.maps.MapEventListener[] = [];
    const markers = draftVertices.map((position, index) => {
      const marker = new mapsApi.Marker({
        map,
        position: toLatLng(mapsApi, position),
        draggable: true,
        title: `작업 구역 꼭짓점 ${index + 1}`,
        icon: {
          content: createVertexMarker(index),
          anchor: { x: 8, y: 8 },
        },
      });
      listeners.push(
        mapsApi.Event.addListener(
          marker,
          'dragend',
          (event: naver.maps.PointerEvent) => {
            const coordinate = (event.coord ?? marker.getPosition()) as naver.maps.LatLng;
            onMoveVertex(index, toLngLat(coordinate));
          },
        ),
      );
      return marker;
    });

    return () => {
      mapsApi.Event.removeListener(listeners);
      markers.forEach((marker) => marker.setMap(null));
    };
  }, [draftVertices, editing, mapsApi, onMoveVertex]);

  useEffect(() => {
    const map = mapRef.current;

    if (!mapsApi || !map || !robotId || !markerPosition) {
      return;
    }

    const marker = new mapsApi.Marker({
      map,
      position: toLatLng(mapsApi, markerPosition),
      title: livePositionAvailable ? `${robotId} 실제 위치` : `${robotId} 샘플 위치`,
      icon: {
        content: createRobotMarker(
          robotId,
          livePositionAvailable ? robotMode ?? 'idle' : 'sample',
          headingDegrees ?? 0,
        ),
        anchor: { x: 12, y: 12 },
      },
      zIndex: 20,
    });

    if (livePositionAvailable) {
      map.panTo(toLatLng(mapsApi, markerPosition));
    }

    return () => marker.setMap(null);
  }, [
    headingDegrees,
    livePositionAvailable,
    mapsApi,
    markerPosition,
    robotId,
    robotMode,
  ]);

  return (
    <div
      ref={containerRef}
      className="maplibre-container"
      aria-label="네이버 위성 작업 지도"
      style={{ width: '100%', height: '100%' }}
    />
  );
}

function toLatLng(maps: typeof naver.maps, [longitude, latitude]: LngLat) {
  return new maps.LatLng(latitude, longitude);
}

function toLngLat(coordinate: naver.maps.LatLng): LngLat {
  return [coordinate.lng(), coordinate.lat()];
}

function createVertexMarker(index: number) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'naver-work-zone-vertex';
  element.setAttribute('aria-label', `작업 구역 꼭짓점 ${index + 1}`);
  return element;
}

function createRobotMarker(robotId: string, mode: string, headingDegrees: number) {
  const element = document.createElement('div');
  element.className = `maplibre-robot-marker ${mode}`;
  element.setAttribute('aria-label', `${robotId} 위치`);
  element.style.setProperty('--marker-heading', `${headingDegrees}deg`);
  element.append(document.createElement('i'));
  return element;
}

function toMapErrorMessage(error: unknown) {
  const reason = error instanceof Error ? error.message : String(error);
  return `지도를 초기화하지 못했습니다. ${reason}`;
}
