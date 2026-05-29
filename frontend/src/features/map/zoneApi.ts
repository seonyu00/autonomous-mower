import { httpClient } from '../../shared/api/httpClient';
import type { PolygonGeometry } from './geojson';

export async function getWorkZone(robotId: string): Promise<PolygonGeometry | null> {
  if (import.meta.env.DEV) {
    return null;
  }

  return httpClient.get<PolygonGeometry | null>(`/api/robots/${robotId}/work-zone`);
}
