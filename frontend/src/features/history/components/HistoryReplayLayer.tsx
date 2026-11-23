import { useEffect, useRef } from 'react';
import { isValidLngLat } from '../../map/geojson';
import { replayLngLat, type MissionReplay, type ReplayFrame } from '../missionReplay';

type Props = {
  maps: typeof naver.maps;
  map: naver.maps.Map;
  replay: MissionReplay;
  frame: ReplayFrame;
};

export function HistoryReplayLayer({ maps, map, replay, frame }: Props) {
  const overlays = useRef<{ path: naver.maps.Polyline; pose: naver.maps.Marker; target: naver.maps.Marker } | null>(null);
  const { anchor } = replay;
  const { path, pose, target, objects, fresh } = frame;

  useEffect(() => {
    const boundary = replayPath(maps, replay.boundary, replay.anchor);
    const outline = new maps.Polygon({ map, paths: [boundary],
      strokeColor: '#f5faf7', strokeWeight: 2, fillColor: '#e6f8ed', fillOpacity: 0.07, clickable: false });
    if (boundary.length >= 3) {
      const bounds = new maps.LatLngBounds(boundary[0], boundary[0]);
      boundary.slice(1).forEach(point => bounds.extend(point));
      map.fitBounds(bounds, { top: 52, right: 52, bottom: 52, left: 52 });
    }
    return () => outline.setMap(null);
  }, [maps, map, replay]);

  useEffect(() => {
    const origin = new maps.LatLng(anchor.lat, anchor.lon);
    const items = {
      path: new maps.Polyline({ map, path: [], visible: false, clickable: false,
        strokeColor: '#75caff', strokeWeight: 5, zIndex: 8 }),
      pose: new maps.Marker({ map, position: origin, visible: false, clickable: false, zIndex: 12,
        title: '기록된 기체 위치', icon: { content: replayDot('pose'), anchor: { x: 7, y: 7 } } }),
      target: new maps.Marker({ map, position: origin, visible: false, clickable: false, zIndex: 11,
        title: '다음 목표점', icon: { content: replayDot('target'), anchor: { x: 7, y: 7 } } }),
    };
    overlays.current = items;
    return () => {
      Object.values(items).forEach(item => item.setMap(null));
      overlays.current = null;
    };
  }, [maps, map, anchor]);

  useEffect(() => {
    const items = overlays.current;
    if (!items) return;
    const points = replayPath(maps, path, anchor);
    if (points.length > 1) items.path.setPath(points);
    items.path.setVisible(points.length > 1);
    for (const [marker, point] of [[items.pose, pose], [items.target, target]] as const) {
      const coordinate = point ? replayPath(maps, [point], anchor)[0] : undefined;
      if (coordinate) marker.setPosition(coordinate);
      marker.setVisible(!!coordinate);
    }
  }, [maps, map, anchor, path, pose, target]);

  useEffect(() => {
    const marks: Array<naver.maps.Polygon | naver.maps.Marker> = [];
    for (const object of objects) {
      const color = object.label === 'person' ? '#ff9bb4' : '#ffc479';
      const opacity = fresh && object.visible ? 1 : 0.55;
      const region = replayPath(maps, object.region, anchor);
      const safety = replayPath(maps, object.safety, anchor);
      if (safety.length >= 3) {
        marks.push(new maps.Polygon({ map, paths: [safety], strokeColor: color, strokeStyle: 'shortdash',
          strokeWeight: 2, strokeOpacity: opacity, fillOpacity: 0, clickable: false, zIndex: 4 }));
      }
      if (region.length >= 3) {
        marks.push(new maps.Polygon({ map, paths: [region], strokeColor: color, strokeWeight: 1,
          strokeOpacity: opacity, fillColor: color, fillOpacity: 0.3 * opacity, clickable: false, zIndex: 5 }));
      }
      const position = replayPath(maps, [object.position], anchor)[0];
      if (position && (object.label === 'person' || region.length < 3)) {
        const icon = replayDot('obstacle');
        icon.style.backgroundColor = color;
        icon.style.opacity = String(opacity);
        marks.push(new maps.Marker({ map, position, clickable: false, zIndex: 10,
          title: '기록된 장애물', icon: { content: icon, anchor: { x: 7, y: 7 } } }));
      }
    }
    return () => marks.forEach(mark => mark.setMap(null));
  }, [maps, map, anchor, objects, fresh]);

  return null;
}

function replayPath(maps: Props['maps'], points: ReplayFrame['path'], anchor: MissionReplay['anchor']) {
  const converted = points.map(point => replayLngLat(point, anchor));
  return converted.every(([lon, lat]) => isValidLngLat(lon, lat))
    ? converted.map(([lon, lat]) => new maps.LatLng(lat, lon)) : [];
}

function replayDot(kind: 'pose' | 'target' | 'obstacle') {
  const dot = document.createElement('span');
  dot.className = `history-replay-dot ${kind}`;
  dot.setAttribute('aria-hidden', 'true');
  return dot;
}
