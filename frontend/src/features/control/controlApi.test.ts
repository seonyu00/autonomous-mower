import { beforeEach, describe, expect, it } from 'vitest';
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
