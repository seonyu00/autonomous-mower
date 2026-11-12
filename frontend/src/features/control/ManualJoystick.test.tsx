import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdControl, resetStores, TEST_ROBOT_ID } from '../../test/testStores';
import { useRobotStore } from '../robots/robotStore';
import { useTelemetryStore } from '../telemetry/telemetryStore';
import { useControlStore } from './controlStore';
import { ManualJoystick } from './ManualJoystick';
import { prepareManual, rearmManual, requestManualChallenge, sendManualCommand, sendStopCommand } from './controlApi';

vi.mock('./controlApi', async (original) => ({
  ...await original<typeof import('./controlApi')>(),
  sendManualCommand: vi.fn(),
  sendStopCommand: vi.fn(),
  rearmManual: vi.fn(),
  requestManualChallenge: vi.fn(),
  prepareManual: vi.fn(),
}));

const manual = vi.mocked(sendManualCommand);
const stop = vi.mocked(sendStopCommand);
const rearm = vi.mocked(rearmManual);
const press = (label = '전진') => fireEvent.pointerDown(screen.getByLabelText(`수동 ${label}`), { button: 0, pointerId: 1 });
const advance = async (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const makeReady = async (robotId = TEST_ROBOT_ID) => {
  fireEvent.click(screen.getByRole('button', { name: '수동 조작 재개' }));
  await act(async () => {});
  act(() => useControlStore.getState().patchControlState(robotId, { lastCommandEvent: {
    robotId, commandId: 'prepare-1', commandType: 'manual-prepare', status: 'completed', reason: null,
    requestedBy: 'admin', serverTimestamp: new Date().toISOString(), edgeAckAt: new Date().toISOString(),
  } }));
  await act(async () => {});
  act(() => useControlStore.getState().patchControlState(robotId, { lastCommandEvent: {
    robotId, commandId: 'arm-1', commandType: 'manual-rearm', status: 'edge-ack', reason: null,
    requestedBy: 'admin', serverTimestamp: new Date().toISOString(), edgeAckAt: new Date().toISOString(),
  } }));
};

describe('ManualJoystick 입력 수명', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStores();
    holdControl();
    manual.mockReset().mockResolvedValue({} as Awaited<ReturnType<typeof sendManualCommand>>);
    stop.mockReset().mockResolvedValue({} as Awaited<ReturnType<typeof sendStopCommand>>);
    rearm.mockReset().mockResolvedValue({ commandId: 'arm-1' } as Awaited<ReturnType<typeof rearmManual>>);
    vi.mocked(requestManualChallenge).mockReset().mockResolvedValue({ challenge: 'example' });
    vi.mocked(prepareManual).mockReset().mockResolvedValue({ commandId: 'prepare-1' } as Awaited<ReturnType<typeof prepareManual>>);
    // jsdom의 PointerEvent 지원 여부와 무관하게 포인터 ID를 전달한다.
    vi.stubGlobal('PointerEvent', class extends MouseEvent {
      pointerId: number;
      constructor(type: string, options: PointerEventInit = {}) {
        super(type, options);
        this.pointerId = options.pointerId ?? 0;
      }
    });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('장비가 재개를 확인하기 전에는 방향을 보낼 수 없다', async () => {
    render(<ManualJoystick />);
    press();
    await advance(300);
    expect(manual).not.toHaveBeenCalled();
    await makeReady();
    press();
    await advance(0);
    expect(manual).toHaveBeenCalledTimes(1);
  });

  it('준비 완료 전에는 재개하지 않고 준비 취소 후 늦은 완료를 버린다', async () => {
    render(<ManualJoystick />);
    fireEvent.click(screen.getByRole('button', { name: '수동 조작 재개' }));
    await act(async () => {});
    expect(prepareManual).toHaveBeenCalledOnce();
    expect(rearm).not.toHaveBeenCalled();
    expect(screen.getByLabelText('수동 전진')).toBeDisabled();
    const grid = screen.getByLabelText('수동 전진').parentElement!;
    const preparation = screen.getByText(/장비의 연결과 중립 상태를 확인/);
    expect(grid.compareDocumentPosition(preparation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '준비 취소' }));
    act(() => useControlStore.getState().patchControlState(TEST_ROBOT_ID, { lastCommandEvent: {
      robotId: TEST_ROBOT_ID, commandId: 'prepare-1', commandType: 'manual-prepare', status: 'completed', reason: null,
      requestedBy: 'admin', serverTimestamp: new Date().toISOString(), edgeAckAt: new Date().toISOString(),
    } }));
    await act(async () => {});
    expect(rearm).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
    expect(screen.getByLabelText('수동 전진')).toBeDisabled();
  });

  it('준비 중 제어권 버전이 바뀌면 취소하고 늦은 완료를 버린다', async () => {
    render(<ManualJoystick />);
    fireEvent.click(screen.getByRole('button', { name: '수동 조작 재개' }));
    await act(async () => {});
    act(() => {
      const state = useControlStore.getState();
      state.patchControlState(TEST_ROBOT_ID, { lockVersion: state.getControlState(TEST_ROBOT_ID).lockVersion + 1 });
    });
    act(() => useControlStore.getState().patchControlState(TEST_ROBOT_ID, { lastCommandEvent: {
      robotId: TEST_ROBOT_ID, commandId: 'prepare-1', commandType: 'manual-prepare', status: 'completed', reason: null,
      requestedBy: 'admin', serverTimestamp: new Date().toISOString(), edgeAckAt: new Date().toISOString(),
    } }));
    await act(async () => {});
    expect(rearm).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
    expect(screen.getByLabelText('수동 전진')).toBeDisabled();
  });

  it('누름마다 다른 식별자를 쓰고 해제 시 같은 식별자로 정지한다', async () => {
    render(<ManualJoystick />);
    await makeReady();
    press();
    await advance(0);
    const first = manual.mock.calls[0][1];
    fireEvent.pointerUp(window, { pointerId: 1 });
    await advance(0);
    expect(stop).toHaveBeenCalledWith(TEST_ROBOT_ID, expect.objectContaining({ armId: first.armId, pressId: first.pressId }));
    await advance(1000);
    press('좌회전');
    await advance(0);
    expect(manual.mock.calls[1][1].pressId).not.toBe(first.pressId);
    expect(manual.mock.calls[1][1].direction).toBe('left');
    expect(rearm).toHaveBeenCalledOnce();
  });

  it('장비가 리모컨 개입으로 거부하면 재개 전까지 반복하지 않는다', async () => {
    render(<ManualJoystick />);
    await makeReady();
    press();
    await advance(0);
    act(() => useControlStore.getState().patchControlState(TEST_ROBOT_ID, { lastCommandEvent: {
      robotId: TEST_ROBOT_ID, commandId: 'movement', commandType: 'manual-command', status: 'failed',
      reason: 'manual-not-armed', requestedBy: 'admin', serverTimestamp: new Date().toISOString(), edgeAckAt: new Date().toISOString(),
    } }));
    await advance(500);
    expect(manual).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '수동 조작 재개' })).toBeEnabled();
    expect(screen.getByLabelText('수동 전진')).toBeDisabled();
  });

  it('장비가 리모컨 개입으로 잠겼다고 알리면 버튼을 비활성화한다', async () => {
    render(<ManualJoystick />);
    await makeReady();
    act(() => useTelemetryStore.getState().upsertStatus({
      robotId: TEST_ROBOT_ID, connectionState: 'online', mqttState: 'connected', wssState: 'connected',
      edgeState: 'manual-serial-locked', manualLockReason: 'remote-active', lastSeenAt: new Date(Date.now() + 1000).toISOString(), stale: false,
    }));
    expect(screen.getByLabelText('수동 전진')).toBeDisabled();
    expect(screen.getByRole('button', { name: '수동 조작 재개' })).toBeEnabled();
    expect(screen.getByText(/리모컨 개입이 감지됐습니다/)).toBeInTheDocument();
  });

  it('누르는 동안 500ms 이후에도 최신 방향을 반복한다', async () => {
    render(<ManualJoystick />);
    await makeReady();
    press();
    await advance(600);
    expect(manual).toHaveBeenCalledTimes(7);
    fireEvent.pointerUp(window, { pointerId: 1 });
    await advance(0);
    press('좌회전');
    await advance(100);
    expect(manual).toHaveBeenLastCalledWith(TEST_ROBOT_ID, expect.objectContaining({ direction: 'left' }));
    expect(stop).toHaveBeenCalled();
  });

  it.each(['pointerup', 'pointercancel', 'blur', 'pagehide'])('%s 이후 반복하지 않는다', async (event) => {
    render(<ManualJoystick />);
    await makeReady();
    press();
    await advance(0);
    fireEvent(window, event.startsWith('pointer')
      ? new PointerEvent(event, { pointerId: 1 }) : new Event(event));
    await advance(1000);
    expect(manual).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledWith(TEST_ROBOT_ID, expect.objectContaining({ allowUnselected: true, armId: 'arm-1', pressId: expect.any(String) }));
  });

  it('연결 비활성화 시 중단하고 복구만으로 재개하지 않는다', async () => {
    render(<ManualJoystick />);
    await makeReady();
    press();
    await advance(0);
    act(() => useTelemetryStore.setState({ connectionState: 'disconnected' }));
    await advance(200);
    act(() => useTelemetryStore.setState({ connectionState: 'mock' }));
    await advance(500);
    expect(manual).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledWith(TEST_ROBOT_ID, expect.objectContaining({ allowUnselected: true, armId: 'arm-1', pressId: expect.any(String) }));
  });

  it('포인터 캡처 상실과 숨김 전환 시 반복을 중단한다', async () => {
    render(<ManualJoystick />);
    await makeReady();
    press();
    await advance(0);
    fireEvent.lostPointerCapture(screen.getByLabelText('수동 전진'), { pointerId: 1 });
    await advance(300);
    expect(manual).toHaveBeenCalledTimes(1);
    press();
    await advance(0);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    await advance(300);
    expect(manual).toHaveBeenCalledTimes(2);
    visibility.mockRestore();
  });

  it('실패한 이동 전송은 반복을 멈추고 정지를 시도한다', async () => {
    manual.mockRejectedValueOnce(new Error('전송 실패'));
    render(<ManualJoystick />);
    await makeReady();
    press();
    await advance(1000);
    expect(manual).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalled();
    expect(screen.getByText('전송 실패')).toBeInTheDocument();
  });

  it('로봇 전환과 언마운트 시 누르던 로봇에 정지를 시도한다', async () => {
    const view = render(<ManualJoystick />);
    await makeReady();
    press();
    await advance(0);
    act(() => {
      useControlStore.getState().patchControlState('MOWER-02', { lockState: 'held', controlOwner: 'admin' });
      useRobotStore.setState({ selectedRobotId: 'MOWER-02' });
    });
    await advance(500);
    expect(stop).toHaveBeenLastCalledWith(TEST_ROBOT_ID, expect.objectContaining({ allowUnselected: true }));
    expect(manual).toHaveBeenCalledTimes(1);
    await makeReady('MOWER-02');
    press();
    await advance(0);
    view.unmount();
    expect(stop).toHaveBeenLastCalledWith('MOWER-02', expect.objectContaining({ allowUnselected: true }));
  });

  it('느린 이동 요청 중에는 큐를 만들지 않고 완료 후 최신 입력만 보낸다', async () => {
    let resolve!: (result: Awaited<ReturnType<typeof sendManualCommand>>) => void;
    manual.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    render(<ManualJoystick />);
    await makeReady();
    press();
    press('좌회전');
    await advance(3000);
    expect(manual).toHaveBeenCalledTimes(1);
    await act(async () => resolve({} as Awaited<ReturnType<typeof sendManualCommand>>));
    await advance(100);
    expect(manual).toHaveBeenCalledTimes(2);
    expect(manual).toHaveBeenLastCalledWith(TEST_ROBOT_ID, expect.objectContaining({ direction: 'forward' }));
  });

  it('이동 HTTP가 대기 중이어도 정지를 시도하고 늦은 완료로 반복을 재개하지 않는다', async () => {
    let resolve!: (result: Awaited<ReturnType<typeof sendManualCommand>>) => void;
    manual.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    render(<ManualJoystick />);
    await makeReady();
    press();
    await advance(0);
    fireEvent.pointerUp(window, { pointerId: 1 });
    await advance(1000);
    expect(stop).toHaveBeenCalledTimes(1);
    await act(async () => resolve({} as Awaited<ReturnType<typeof sendManualCommand>>));
    await advance(1000);
    expect(stop).toHaveBeenCalledTimes(2);
    expect(manual).toHaveBeenCalledTimes(1);
  });

  it('버튼을 놓은 뒤 확인값이 와도 이동을 보내지 않는다', async () => {
    let resolve!: (result: { challenge: string }) => void;
    render(<ManualJoystick />);
    await makeReady();
    vi.mocked(requestManualChallenge).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    press();
    fireEvent.pointerUp(window, { pointerId: 1 });
    await act(async () => resolve({ challenge: 'late' }));
    await advance(500);
    expect(manual).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });
});
