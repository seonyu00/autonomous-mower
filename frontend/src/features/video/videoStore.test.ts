import { beforeEach, describe, expect, it } from 'vitest';
import { resetStores, TEST_ROBOT_ID } from '../../test/testStores';
import { createDefaultVideoSession, defaultVideoQualityPolicy, useVideoStore } from './videoStore';

describe('videoStore', () => {
  beforeEach(() => {
    resetStores();
  });

  it('creates an idle mock session with the SRS stream quality policy', () => {
    expect(createDefaultVideoSession(TEST_ROBOT_ID)).toMatchObject({
      robotId: TEST_ROBOT_ID,
      connectionState: 'idle',
      loading: false,
      qualityPolicy: defaultVideoQualityPolicy,
      snapshot: null,
      mock: true,
    });
  });

  it('patches state transitions by robot id', () => {
    useVideoStore.getState().patchSession(TEST_ROBOT_ID, {
      connectionState: 'connecting',
      loading: true,
    });
    useVideoStore.getState().patchSession(TEST_ROBOT_ID, {
      sessionId: 'video-session-1',
      connectionState: 'connected',
      loading: false,
      mock: false,
    });

    expect(useVideoStore.getState().getSession(TEST_ROBOT_ID)).toMatchObject({
      sessionId: 'video-session-1',
      connectionState: 'connected',
      loading: false,
      mock: false,
    });
  });

  it('records saved snapshots compatible with log snapshot references', () => {
    const capturedAt = '2026-05-30T01:00:00.000Z';
    const snapshot = {
      id: 'snapshot-001',
      robotId: TEST_ROBOT_ID,
      capturedAt,
      contentType: 'image/jpeg' as const,
      status: 'saved' as const,
      url: '/api/logs/snapshots/snapshot-001',
    };
    useVideoStore.getState().setSnapshot(TEST_ROBOT_ID, snapshot);

    expect(snapshot).toEqual({
      id: 'snapshot-001',
      robotId: TEST_ROBOT_ID,
      capturedAt,
      contentType: 'image/jpeg',
      status: 'saved',
      url: '/api/logs/snapshots/snapshot-001',
    });
    expect(useVideoStore.getState().getSession(TEST_ROBOT_ID).snapshot).toEqual(snapshot);
  });

  it('resets a robot video session without affecting other robots', () => {
    useVideoStore.getState().patchSession(TEST_ROBOT_ID, {
      connectionState: 'connected',
      sessionId: 'video-session-1',
    });
    useVideoStore.getState().patchSession('MOWER-02', {
      connectionState: 'failed',
      error: 'ICE failed',
    });

    useVideoStore.getState().resetSession(TEST_ROBOT_ID);

    expect(useVideoStore.getState().getSession(TEST_ROBOT_ID)).toMatchObject({
      connectionState: 'idle',
      sessionId: null,
      error: null,
    });
    expect(useVideoStore.getState().getSession('MOWER-02')).toMatchObject({
      connectionState: 'failed',
      error: 'ICE failed',
    });
  });
});
