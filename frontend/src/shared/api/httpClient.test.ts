import { beforeEach, describe, expect, it, vi } from 'vitest';

const clearSession = vi.fn();

vi.mock('../config/env', () => ({
  env: {
    apiBaseUrl: '',
  },
}));

vi.mock('../../features/auth/authStore', () => ({
  getAccessToken: () => 'expired-token',
  useAuthStore: {
    getState: () => ({
      clearSession,
    }),
  },
}));

import { httpClient } from './httpClient';

describe('httpClient', () => {
  beforeEach(() => {
    clearSession.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 401,
          statusText: 'Unauthorized',
        }),
      ),
    );
  });

  it('인증 요청이 401이면 저장된 로그인 세션을 제거한다', async () => {
    await expect(httpClient.get('/api/robots')).rejects.toMatchObject({
      kind: 'auth',
      status: 401,
    });

    expect(clearSession).toHaveBeenCalledTimes(1);
  });

  it('FormData 요청에는 JSON Content-Type을 강제로 지정하지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { id: 'snapshot-001' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const formData = new FormData();
    formData.append('file', new Blob(['jpeg'], { type: 'image/jpeg' }), 'snapshot.jpg');

    await httpClient.postForm('/api/snapshots', formData);

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Headers;
    expect(headers.has('Content-Type')).toBe(false);
  });

  it('인증된 바이너리 응답을 Blob으로 반환한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const blob = await httpClient.getBlob('/api/logs/snapshots/snapshot-001');

    expect(blob.type).toBe('image/jpeg');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/logs/snapshots/snapshot-001',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
