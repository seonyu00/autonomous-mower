import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { resetStores, TEST_ROBOT_ID } from '../../test/testStores';
import { useControlStore } from './controlStore';
import { CommandEventStatus } from './CommandEventStatus';
import { parseTopicMessage } from '../../shared/realtime/topicRouter';
import type { ControlCommandEvent } from './types';

beforeEach(() => resetStores());
afterEach(cleanup);
const event = (status: ControlCommandEvent['status']): ControlCommandEvent => ({
  robotId: TEST_ROBOT_ID, commandId: 'cmd', commandType: 'stop', status, reason: null,
  requestedBy: 'admin', serverTimestamp: '2026-09-15T00:00:00Z', edgeAckAt: null,
});

it('수신 확인은 실행 완료로 표시하지 않는다', () => {
  useControlStore.getState().applyCommandEvent(event('edge-ack'));
  render(<CommandEventStatus robotId={TEST_ROBOT_ID} />);
  expect(screen.getByText(/장비 수신 확인 · 실행 완료 미확인/)).toBeInTheDocument();
});

it('완료 응답을 파싱하고 중복·역순 상태가 완료를 되돌리지 않는다', () => {
  const message = parseTopicMessage(`/topic/robots/${TEST_ROBOT_ID}/control-events`, JSON.stringify(event('completed')));
  expect(message.type).toBe('control-events');
  useControlStore.getState().applyCommandEvent(event('completed'));
  const completed = useControlStore.getState().getControlState(TEST_ROBOT_ID).lastCommandEvent;
  for (const status of ['completed', 'executing', 'edge-ack', 'sent-to-edge', 'accepted'] as const) {
    useControlStore.getState().applyCommandEvent(event(status));
  }
  expect(useControlStore.getState().getControlState(TEST_ROBOT_ID).lastCommandEvent).toBe(completed);
  render(<CommandEventStatus robotId={TEST_ROBOT_ID} />);
  expect(screen.getByText(/장비 실행 완료 응답 확인/)).toBeInTheDocument();
});

it('발행 실패 이후 늦은 접수 이벤트가 실패를 지우지 않는다', () => {
  useControlStore.getState().applyCommandEvent({ ...event('failed'), reason: 'publish-failed' });
  useControlStore.getState().applyCommandEvent(event('accepted'));
  render(<CommandEventStatus robotId={TEST_ROBOT_ID} />);
  expect(screen.getByText(/명령 실패.*publish-failed/)).toBeInTheDocument();
});
