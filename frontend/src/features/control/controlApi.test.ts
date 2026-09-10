import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpClient } from '../../shared/api/httpClient';
import { env } from '../../shared/config/env';
import { useAuthStore } from '../auth/authStore';
import { useControlStore } from './controlStore';
import {
  changeMode,
  sendManualCommand,
  sendMowerAttachmentCommand,
} from './controlApi';
import { resetStores, holdControl, TEST_ROBOT_ID } from '../../test/testStores';

describe('control command prechecks', () => {
  beforeEach(() => {
    resetStores();
    holdControl();
  });

  it.each([false, true])('로그아웃 후 명령 응답·오류가 이전 제어 상태를 복원하지 않는다: 실패=%s', async (fails) => {
    const previousMock = env.enableMockControl;
    env.enableMockControl = false;
    let finish!: () => void;
    const post = vi.spyOn(httpClient, 'post').mockImplementationOnce(() => new Promise((resolve, reject) => {
      finish = () => fails ? reject(new Error('offline')) : resolve({ accepted: true, mode: 'manual' });
    }));
    const result = changeMode(TEST_ROBOT_ID, 'manual').catch(() => undefined);
    useAuthStore.getState().clearSession();
    finish();
    await result;
    expect(useControlStore.getState().controlByRobotId).toEqual({});
    post.mockRestore();
    env.enableMockControl = previousMock;
  });

  it('blocks normal commands while E-Stop is active', async () => {
    holdControl({
      emergency: true,
      mode: 'emergency',
    });

    await expect(changeMode(TEST_ROBOT_ID, 'autonomous')).rejects.toMatchObject({
      name: 'ControlPrecheckError',
      reasons: expect.arrayContaining(['robot-in-emergency']),
    });

    await expect(sendMowerAttachmentCommand(TEST_ROBOT_ID, 'blade-start')).rejects.toMatchObject({
      name: 'ControlPrecheckError',
      reasons: expect.arrayContaining(['robot-in-emergency']),
    });
  });

  it('blocks read-only users from manual control commands', async () => {
    resetStores('read-only');
    holdControl();

    await expect(
      sendManualCommand(TEST_ROBOT_ID, {
        action: 'manual',
        robotId: TEST_ROBOT_ID,
        direction: 'forward',
        speed: 0.5,
      }),
    ).rejects.toMatchObject({
      name: 'ControlPrecheckError',
      reasons: expect.arrayContaining(['missing-control-permission']),
    });
  });

  it('blocks read-only users from mode and mower attachment commands', async () => {
    resetStores('read-only');
    holdControl();

    await expect(changeMode(TEST_ROBOT_ID, 'manual')).rejects.toMatchObject({
      name: 'ControlPrecheckError',
      reasons: expect.arrayContaining(['missing-control-permission']),
    });

    await expect(sendMowerAttachmentCommand(TEST_ROBOT_ID, 'raise')).rejects.toMatchObject({
      name: 'ControlPrecheckError',
      reasons: expect.arrayContaining(['missing-control-permission']),
    });
  });
});
