import type { Feature, LineString } from 'geojson';
import type { LngLat } from './geojson';

const MAX_SESSION_ROUTE_POINTS = 500;

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

export function toLineFeature(
  robotId: string,
  coordinates: readonly LngLat[],
  routeType: 'planned' | 'completed',
): Feature<LineString> | undefined {
  if (coordinates.length < 2) {
    return undefined;
  }

  return {
    type: 'Feature',
    properties: {
      robotId,
      routeType,
    },
    geometry: {
      type: 'LineString',
      coordinates: coordinates.map(toLngLat),
    },
  };
}

function toLngLat(position: readonly number[]): LngLat {
  return [position[0], position[1]];
}
