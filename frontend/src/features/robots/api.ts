import { httpClient } from '../../shared/api/httpClient';
import { mockRobots } from './mockRobots';
import type { Robot } from './types';

export async function getRobots(): Promise<Robot[]> {
  if (import.meta.env.DEV) {
    return mockRobots;
  }

  return httpClient.get<Robot[]>('/api/robots');
}
