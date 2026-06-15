import { httpClient } from '../../shared/api/httpClient';
import { ApiError } from '../../shared/api/errors';
import { env } from '../../shared/config/env';
import { mockWorkZoneByRobotId } from './mockMapData';
import { toPostGisPolygonPayload } from './geojson';
import type { PolygonGeometry, PostGisPolygonPayload } from './geojson';

type WorkZoneResponse = {
  zoneId: number;
  robotId: string;
  version: number;
  updatedAt: string;
  zone: PostGisPolygonPayload;
};

export type WorkZoneSnapshot = {
  geometry: PolygonGeometry | null;
  version: number | null;
  zoneId: number | null;
  updatedAt: string | null;
  mock: boolean;
};

export async function getWorkZone(robotId: string): Promise<WorkZoneSnapshot> {
  if (isMockWorkZoneEnabled()) {
    return {
      geometry: mockWorkZoneByRobotId[robotId]?.geometry ?? null,
      version: null,
      zoneId: null,
      updatedAt: null,
      mock: true,
    };
  }

  try {
    const response = await httpClient.get<WorkZoneResponse>(`/api/robots/${robotId}/work-zone`);
    return {
      geometry: response.zone.geometry,
      version: response.version,
      zoneId: response.zoneId,
      updatedAt: response.updatedAt,
      mock: false,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return {
        geometry: null,
        version: null,
        zoneId: null,
        updatedAt: null,
        mock: false,
      };
    }

    throw error;
  }
}

export type SaveWorkZoneRequest = {
  robotId: string;
  expectedVersion: number | null;
  zone: PostGisPolygonPayload;
};

export type SaveWorkZoneResponse = {
  robotId: string;
  zoneId: number | null;
  version: number;
  updatedAt: string;
  saved: boolean;
};

export async function saveWorkZone(
  robotId: string,
  polygon: PolygonGeometry,
  expectedVersion: number | null,
): Promise<SaveWorkZoneResponse> {
  const request: SaveWorkZoneRequest = {
    robotId,
    expectedVersion,
    zone: toPostGisPolygonPayload(polygon),
  };

  if (isMockWorkZoneEnabled()) {
    return {
      robotId,
      zoneId: null,
      version: expectedVersion ?? 0,
      updatedAt: new Date().toISOString(),
      saved: false,
    };
  }

  return httpClient.put<SaveWorkZoneResponse>(`/api/robots/${robotId}/work-zone`, request);
}

export function isMockWorkZoneEnabled() {
  return import.meta.env.DEV && env.enableMockWorkZone;
}
