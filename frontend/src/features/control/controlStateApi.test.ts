import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStores } from '../../test/testStores';
import { fetchCurrentControlState } from './controlStateApi';

describe('fetchCurrentControlState', () => {
  beforeEach(() => {
    resetStores();
  });

  it('loads the current control lock snapshot with the authenticated REST client', async () => {
    const responseBody = {
      success: true,
      data: {
        robotId: 'MOWER-01',
        lockState: 'held',
        controlOwner: 'admin',
        controlOwnerName: 'ADMIN USER',
        mode: 'manual',
        emergency: false,
        lockVersion: 7,
        expiresAt: '2026-06-13T01:05:00Z',
        reason: 'claim-control',
        updatedAt: '2026-06-13T01:00:00Z',
      },
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const snapshot = await fetchCurrentControlState('MOWER-01');

    expect(snapshot.lockVersion).toBe(7);
    const [, request] = fetchMock.mock.calls[0];
    expect(new Headers(request?.headers).get('Authorization')).toBe('Bearer test-access-token');
  });
});
