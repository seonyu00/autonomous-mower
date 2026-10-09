import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdControl, resetStores, TEST_ROBOT_ID } from '../../test/testStores';
import { useRobotStore } from '../robots/robotStore';
import { useTelemetryStore } from '../telemetry/telemetryStore';
import { useControlStore } from './controlStore';
import { ManualJoystick } from './ManualJoystick';
import { sendManualCommand, sendStopCommand } from './controlApi';

vi.mock('./controlApi', async (original) => ({
  ...await original<typeof import('./controlApi')>(),
  sendManualCommand: vi.fn(),
  sendStopCommand: vi.fn(),
}));

const manual = vi.mocked(sendManualCommand);
const stop = vi.mocked(sendStopCommand);
const press = (label = '전진') => fireEvent.pointerDown(screen.getByLabelText(`수동 ${label}`), { button: 0, pointerId: 1 });
const advance = async (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('ManualJoystick 입력 수명', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStores();
    holdControl();
    manual.mockReset().mockResolvedValue({} as Awaited<ReturnType<typeof sendManualCommand>>);
    stop.mockReset().mockResolvedValue({} as Awaited<ReturnType<typeof sendStopCommand>>);
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

  it('누르는 동안 500ms 이후에도 최신 방향을 반복한다', async () => {
    render(<ManualJoystick />);
    press();
    await advance(600);
    expect(manual).toHaveBeenCalledTimes(7);
    press('좌회전');
    await advance(100);
    expect(manual).toHaveBeenLastCalledWith(TEST_ROBOT_ID, expect.objectContaining({ direction: 'left' }));
    expect(stop).not.toHaveBeenCalled();
  });

  it.each(['pointerup', 'pointercancel', 'blur', 'pagehide'])('%s 이후 반복하지 않는다', async (event) => {
    render(<ManualJoystick />);
    press();
    await advance(0);
    fireEvent(window, event.startsWith('pointer')
      ? new PointerEvent(event, { pointerId: 1 }) : new Event(event));
    await advance(1000);
    expect(manual).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledWith(TEST_ROBOT_ID, { allowUnselected: true });
  });

  it('연결 비활성화 시 중단하고 복구만으로 재개하지 않는다', async () => {
    render(<ManualJoystick />);
    press();
    await advance(0);
    act(() => useTelemetryStore.setState({ connectionState: 'disconnected' }));
    await advance(200);
    act(() => useTelemetryStore.setState({ connectionState: 'mock' }));
    await advance(500);
    expect(manual).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledWith(TEST_ROBOT_ID, { allowUnselected: true });
  });

  it('포인터 캡처 상실과 숨김 전환 시 반복을 중단한다', async () => {
    render(<ManualJoystick />);
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
    press();
    await advance(1000);
    expect(manual).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalled();
    expect(screen.getByText('전송 실패')).toBeInTheDocument();
  });

  it('로봇 전환과 언마운트 시 누르던 로봇에 정지를 시도한다', async () => {
    const view = render(<ManualJoystick />);
    press();
    await advance(0);
    act(() => {
      useControlStore.getState().patchControlState('MOWER-02', { lockState: 'held', controlOwner: 'admin' });
      useRobotStore.setState({ selectedRobotId: 'MOWER-02' });
    });
    await advance(500);
    expect(stop).toHaveBeenLastCalledWith(TEST_ROBOT_ID, { allowUnselected: true });
    expect(manual).toHaveBeenCalledTimes(1);
    press();
    await advance(0);
    view.unmount();
    expect(stop).toHaveBeenLastCalledWith('MOWER-02', { allowUnselected: true });
  });

  it('느린 이동 요청 중에는 큐를 만들지 않고 완료 후 최신 입력만 보낸다', async () => {
    let resolve!: (result: Awaited<ReturnType<typeof sendManualCommand>>) => void;
    manual.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    render(<ManualJoystick />);
    press();
    press('좌회전');
    await advance(3000);
    expect(manual).toHaveBeenCalledTimes(1);
    await act(async () => resolve({} as Awaited<ReturnType<typeof sendManualCommand>>));
    await advance(100);
    expect(manual).toHaveBeenCalledTimes(2);
    expect(manual).toHaveBeenLastCalledWith(TEST_ROBOT_ID, expect.objectContaining({ direction: 'left' }));
  });

  it('이동 HTTP가 대기 중이어도 정지를 시도하고 늦은 완료로 반복을 재개하지 않는다', async () => {
    let resolve!: (result: Awaited<ReturnType<typeof sendManualCommand>>) => void;
    manual.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    render(<ManualJoystick />);
    press();
    fireEvent.pointerUp(window, { pointerId: 1 });
    await advance(1000);
    expect(stop).toHaveBeenCalledTimes(1);
    await act(async () => resolve({} as Awaited<ReturnType<typeof sendManualCommand>>));
    await advance(1000);
    expect(stop).toHaveBeenCalledTimes(2);
    expect(manual).toHaveBeenCalledTimes(1);
  });
});
