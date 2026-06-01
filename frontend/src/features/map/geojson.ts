export type LngLat = [longitude: number, latitude: number];

export type PolygonGeometry = {
  type: 'Polygon';
  coordinates: LngLat[][];
};

export type PolygonValidationResult = {
  valid: boolean;
  errors: string[];
};

export type PostGisPolygonPayload = {
  type: 'Polygon';
  srid: 4326;
  geometry: PolygonGeometry;
};

export function validatePolygonGeometry(polygon: PolygonGeometry | null | undefined): PolygonValidationResult {
  const errors: string[] = [];

  if (!polygon) {
    return {
      valid: false,
      errors: ['Polygon geometry가 없습니다.'],
    };
  }

  if (polygon.type !== 'Polygon') {
    errors.push('Geometry 유형은 Polygon이어야 합니다.');
  }

  if (!Array.isArray(polygon.coordinates) || polygon.coordinates.length === 0) {
    errors.push('Polygon에는 하나 이상의 linear ring이 있어야 합니다.');
  }

  const exteriorRing = polygon.coordinates[0] ?? [];

  if (exteriorRing.length < 4) {
    errors.push('Exterior ring에는 닫는 좌표를 포함해 최소 4개 위치가 있어야 합니다.');
  }

  exteriorRing.forEach(([longitude, latitude], index) => {
    if (!isValidLngLat(longitude, latitude)) {
      errors.push(`${index + 1}번 위치는 유효한 WGS84 경도/위도 쌍이어야 합니다.`);
    }
  });

  if (exteriorRing.length >= 2 && !samePosition(exteriorRing[0], exteriorRing[exteriorRing.length - 1])) {
    errors.push('Exterior ring은 첫 위치를 마지막 위치에 반복해 닫아야 합니다.');
  }

  if (hasSelfIntersection(exteriorRing)) {
    errors.push('Exterior ring은 자기 교차가 없어야 합니다.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function toPostGisPolygonPayload(polygon: PolygonGeometry): PostGisPolygonPayload {
  return {
    type: 'Polygon',
    srid: 4326,
    geometry: polygon,
  };
}

export function fromPostGisPolygonPayload(payload: PostGisPolygonPayload): PolygonGeometry {
  return payload.geometry;
}

export function isValidLngLat(longitude: number, latitude: number) {
  return Number.isFinite(longitude) && Number.isFinite(latitude) && longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90;
}

function samePosition(a: LngLat, b: LngLat) {
  return a[0] === b[0] && a[1] === b[1];
}

function hasSelfIntersection(ring: LngLat[]) {
  if (ring.length < 4) {
    return false;
  }

  for (let i = 0; i < ring.length - 1; i += 1) {
    for (let j = i + 1; j < ring.length - 1; j += 1) {
      const adjacent = Math.abs(i - j) <= 1;
      const closingPair = i === 0 && j === ring.length - 2;

      if (adjacent || closingPair) {
        continue;
      }

      if (segmentsIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) {
        return true;
      }
    }
  }

  return false;
}

function segmentsIntersect(a: LngLat, b: LngLat, c: LngLat, d: LngLat) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);

  return abC * abD < 0 && cdA * cdB < 0;
}

function orientation(a: LngLat, b: LngLat, c: LngLat) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
