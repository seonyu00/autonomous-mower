import { httpClient } from '../../shared/api/httpClient';
import { mockWorkZoneByRobotId } from './mockMapData';
import { toPostGisPolygonPayload } from './geojson';
import type { PolygonGeometry, PostGisPolygonPayload } from './geojson';

export async function getWorkZone(robotId: string): Promise<PolygonGeometry | null> {
  if (import.meta.env.DEV) {
    return mockWorkZoneByRobotId[robotId]?.geometry ?? null;
  }

  return httpClient.get<PolygonGeometry | null>(`/api/robots/${robotId}/work-zone`);
}

export type SaveWorkZoneRequest = {
  robotId: string;
  zone: PostGisPolygonPayload;
};

export type SaveWorkZoneResponse = {
  robotId: string;
  zone: PostGisPolygonPayload;
  saved: boolean;
};

export async function saveWorkZone(robotId: string, polygon: PolygonGeometry): Promise<SaveWorkZoneResponse> {
  const request: SaveWorkZoneRequest = {
    robotId,
    zone: toPostGisPolygonPayload(polygon),
  };

  if (import.meta.env.DEV) {
    return {
      ...request,
      saved: false,
    };
  }

  return httpClient.put<SaveWorkZoneResponse>(`/api/robots/${robotId}/work-zone`, request);
}
