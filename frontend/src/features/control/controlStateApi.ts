import { httpClient } from '../../shared/api/httpClient';
import type { ControlLockSnapshot } from './types';

export function fetchCurrentControlState(robotId: string) {
  return httpClient.get<ControlLockSnapshot>(`/api/control/${robotId}`);
}
