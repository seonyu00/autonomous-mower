import { afterEach, expect, it, vi } from 'vitest';
import { env } from '../../shared/config/env';
import { httpClient } from '../../shared/api/httpClient';
import { mockRobots } from './mockRobots';
import { getRobots } from './api';

afterEach(() => vi.restoreAllMocks());

it('개발 Mock을 명시적으로 켜면 실제 조회 없이 기존 샘플 로봇을 반환한다', async () => {
  const previous = env.enableMockRobots;
  env.enableMockRobots = true;
  const get = vi.spyOn(httpClient, 'get');
  expect(await getRobots()).toEqual(mockRobots);
  expect(get).not.toHaveBeenCalled();
  env.enableMockRobots = previous;
});
