import type { LngLat } from './geojson';

const MAX_SESSION_ROUTE_POINTS = 500;
const DISPLAY_WINDOW_SIZE = 3;
const MIN_HEADING_DISTANCE_METERS = 1;

// 관제 화면 표시 전용 평균이다. 장비 위치 추정이나 저장 좌표에는 사용하지 않는다.
export function smoothDisplayPosition(samples: readonly LngLat[], position: LngLat) {
  const previous = samples.at(-1);
  const continuous = previous && Math.abs(previous[0] - position[0]) <= 180 ? samples : [];
  const nextSamples = [...continuous, position].slice(-DISPLAY_WINDOW_SIZE);
  const sum = nextSamples.reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]);
  return { samples: nextSamples, position: [sum[0] / nextSamples.length, sum[1] / nextSamples.length] as LngLat };
}

export function calculateDisplayHeadingDegrees(route: readonly LngLat[]) {
  if (route.length < 2) return null;
  const from = route[route.length - 2];
  const to = route[route.length - 1];
  const latitude = (from[1] + to[1]) * Math.PI / 360;
  const east = (to[0] - from[0]) * Math.PI / 180 * Math.cos(latitude) * 6_371_008.8;
  const north = (to[1] - from[1]) * Math.PI / 180 * 6_371_008.8;
  if (Math.hypot(east, north) < MIN_HEADING_DISTANCE_METERS) return null;
  return calculateHeadingDegrees([from, to]);
}

export function splitRouteByProgress(
  coordinates: readonly (readonly number[])[],
  progress: number,
) {
  const normalizedCoordinates = coordinates
    .filter((position) => position.length >= 2)
    .map(toLngLat);

  if (normalizedCoordinates.length < 2) {
    return {
      completed: normalizedCoordinates,
      planned: normalizedCoordinates,
    };
  }

  const clampedProgress = Math.min(1, Math.max(0, progress));
  const splitIndex = Math.max(
    1,
    Math.min(
      normalizedCoordinates.length - 1,
      Math.round((normalizedCoordinates.length - 1) * clampedProgress),
    ),
  );

  return {
    completed: normalizedCoordinates.slice(0, splitIndex + 1),
    planned: normalizedCoordinates.slice(splitIndex),
  };
}

export function appendRoutePosition(route: readonly LngLat[], position: readonly [number, number]) {
  const nextPosition = toLngLat(position);
  const lastPosition = route.at(-1);

  if (lastPosition?.[0] === nextPosition[0] && lastPosition[1] === nextPosition[1]) {
    return [...route];
  }

  return [...route, nextPosition].slice(-MAX_SESSION_ROUTE_POINTS);
}

export function calculateHeadingDegrees(route: readonly LngLat[]) {
  if (route.length < 2) {
    return null;
  }

  const [previousLongitude, previousLatitude] = route[route.length - 2];
  const [longitude, latitude] = route[route.length - 1];
  const averageLatitudeRadians = ((previousLatitude + latitude) / 2) * (Math.PI / 180);
  const east = (longitude - previousLongitude) * Math.cos(averageLatitudeRadians);
  const north = latitude - previousLatitude;

  if (east === 0 && north === 0) {
    return null;
  }

  return (Math.atan2(east, north) * (180 / Math.PI) + 360) % 360;
}

function toLngLat(position: readonly number[]): LngLat {
  return [position[0], position[1]];
}
