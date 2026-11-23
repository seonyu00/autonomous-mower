import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpClient } from '../../shared/api/httpClient';
import { env } from '../../shared/config/env';
import { useAuthStore } from '../auth/authStore';
import { useZoneStore } from '../map/zoneStore';
import { useControlStore } from './controlStore';
import {
  changeMode,
  releaseControl,
  sendStopCommand,
  sendManualCommand,
  sendMowerAttachmentCommand,
} from './controlApi';
import { resetStores, holdControl, TEST_ROBOT_ID } from '../../test/testStores';

describe('control command prechecks', () => {
  beforeEach(() => {
    resetStores();
    holdControl();
  });

  it('늦은 이동 응답은 진행 중인 정지 요청의 대기 표시를 지우지 않는다', async () => {
    const previousMock = env.enableMockControl;
    env.enableMockControl = false;
    let finishMove!: (value: unknown) => void;
    let finishStop!: (value: unknown) => void;
    const post = vi.spyOn(httpClient, 'post')
      .mockImplementationOnce(() => new Promise(resolve => { finishMove = resolve; }))
      .mockImplementationOnce(() => new Promise(resolve => { finishStop = resolve; }));
    try {
      const move = sendManualCommand(TEST_ROBOT_ID, { action: 'manual', robotId: TEST_ROBOT_ID, direction: 'forward', speed: 0.5 });
      const stop = sendStopCommand(TEST_ROBOT_ID);
      finishMove({ accepted: true });
      await move;
      expect(useControlStore.getState().getControlState(TEST_ROBOT_ID).pendingCommand?.type).toBe('stop');
      finishStop({ accepted: true });
      await stop;
      expect(useControlStore.getState().getControlState(TEST_ROBOT_ID).pendingCommand).toBeNull();
    } finally {
      post.mockRestore();
      env.enableMockControl = previousMock;
    }
  });

  it('일반 명령과 제어권 반납에 현재 lockVersion을 전달한다', async () => {
    const previousMock = env.enableMockControl;
    env.enableMockControl = false;
    holdControl({ lockVersion: 7 });
    const post = vi.spyOn(httpClient, 'post').mockResolvedValue({ accepted: true, lockVersion: 7 });
    try {
      await sendManualCommand(TEST_ROBOT_ID, { action: 'manual', robotId: TEST_ROBOT_ID, direction: 'forward', speed: 0.5 });
      await sendStopCommand(TEST_ROBOT_ID);
      await changeMode(TEST_ROBOT_ID, 'manual');
      await sendMowerAttachmentCommand(TEST_ROBOT_ID, 'raise');
      await releaseControl(TEST_ROBOT_ID);
      expect(post).toHaveBeenCalledTimes(5);
      for (const [, body] of post.mock.calls) expect(body).toMatchObject({ lockVersion: 7 });
    } finally {
      post.mockRestore();
      env.enableMockControl = previousMock;
    }
  });

  it('최신 제어권보다 오래된 HTTP 응답과 STOMP 상태를 무시한다', async () => {
    const previousMock = env.enableMockControl;
    env.enableMockControl = false;
    holdControl({ lockVersion: 7 });
    let finish!: (result: unknown) => void;
    const post = vi.spyOn(httpClient, 'post').mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    try {
      const request = changeMode(TEST_ROBOT_ID, 'manual');
      useControlStore.getState().applyLockSnapshot({ robotId: TEST_ROBOT_ID, lockState: 'held', controlOwner: 'other', controlOwnerName: 'Other', mode: 'idle', emergency: false, lockVersion: 9, expiresAt: null, reason: 'takeover', updatedAt: new Date().toISOString() });
      finish({ lockVersion: 8, controlOwner: 'admin', mode: 'manual', lockState: 'held' });
      await request;
      const current = useControlStore.getState().getControlState(TEST_ROBOT_ID);
      useControlStore.getState().applyLockSnapshot({ ...current, controlOwnerName: 'Admin', controlOwner: 'admin', lockVersion: 7, reason: 'old', updatedAt: new Date().toISOString() });
      expect(useControlStore.getState().getControlState(TEST_ROBOT_ID)).toMatchObject({ lockVersion: 9, controlOwner: 'other', mode: 'idle' });
    } finally {
      post.mockRestore();
      env.enableMockControl = previousMock;
    }
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

  it('저장한 구역으로 경로 검토 없이 AUTO를 요청하고 편집 중에는 차단한다', async () => {
    const previousMock = env.enableMockControl;
    env.enableMockControl = false;
    const post = vi.spyOn(httpClient, 'post').mockResolvedValue({ accepted: true });
    try {
      useZoneStore.getState().setZone(TEST_ROBOT_ID, { type: 'Polygon', coordinates: [
        [[127, 36], [127.01, 36], [127, 36.01], [127, 36]],
      ] }, 11, 2);
      await changeMode(TEST_ROBOT_ID, 'autonomous');
      const [, body] = post.mock.calls[0];
      expect(body).toMatchObject({ mode: 'autonomous', workZoneId: 2, workZoneVersion: 11 });
      expect(body).not.toHaveProperty('planId');
      useZoneStore.getState().startEditing(TEST_ROBOT_ID + '::travel');
      await expect(changeMode(TEST_ROBOT_ID, 'autonomous')).rejects.toMatchObject({ name: 'ControlPrecheckError' });
      expect(post).toHaveBeenCalledTimes(1);
    } finally {
      post.mockRestore();
      env.enableMockControl = previousMock;
    }
  });

  it('AUTO 요청의 제어권을 갱신하고 브라우저 이탈 후에는 멈춘다', async () => {
    const previousMock = env.enableMockControl;
    env.enableMockControl = false;
    vi.useFakeTimers();
    const post = vi.spyOn(httpClient, 'post')
      .mockResolvedValueOnce({ accepted: true, commandId: 'cmd-auto', lockVersion: 3, mode: 'autonomous' })
      .mockResolvedValue(undefined);
    try {
      useZoneStore.getState().setZone(TEST_ROBOT_ID, { type: 'Polygon', coordinates: [
        [[127, 36], [127.01, 36], [127, 36.01], [127, 36]],
      ] }, 11, 2);
      await changeMode(TEST_ROBOT_ID, 'autonomous');
      expect(post).toHaveBeenLastCalledWith(`/api/control/${TEST_ROBOT_ID}/autonomy-keepalive`,
        { commandId: 'cmd-auto', lockVersion: 3 }, expect.anything());
      // 준비 중인 장비는 실제 모드를 idle로 보고할 수 있다.
      useControlStore.getState().patchControlState(TEST_ROBOT_ID, { mode: 'idle' });
      await vi.advanceTimersByTimeAsync(750);
      expect(post).toHaveBeenCalledTimes(3);
      window.dispatchEvent(new Event('pagehide'));
      await vi.advanceTimersByTimeAsync(3000);
      expect(post).toHaveBeenCalledTimes(3);
    } finally {
      window.dispatchEvent(new Event('pagehide'));
      post.mockRestore();
      vi.useRealTimers();
      env.enableMockControl = previousMock;
    }
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
