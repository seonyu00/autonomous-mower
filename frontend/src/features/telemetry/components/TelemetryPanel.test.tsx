import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStores, TEST_ROBOT_ID } from '../../../test/testStores';
import { useTelemetryStore } from '../telemetryStore';
import { TelemetryPanel } from './TelemetryPanel';

describe('TelemetryPanel compact summary', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it.each([true, false])('오류와 원본 코드를 구분해 표시한다 (요약 %s)', (compact) => {
    const telemetry = useTelemetryStore.getState().telemetryByRobotId[TEST_ROBOT_ID];
    const update = (errorState: string | null) => act(() =>
      useTelemetryStore.getState().upsertTelemetry({ ...telemetry, errorState }));
    render(<TelemetryPanel compact={compact} />);
    expect(screen.queryByRole('status')).toBeNull();
    update('emergency-stop-active');
    expect(screen.getByRole('status')).toHaveTextContent('비상 정지 활성화');
    update('<unknown>');
    expect(screen.getByRole('status')).toHaveTextContent('알 수 없는 오류');
    expect(screen.getByText('<unknown>').tagName).toBe('CODE');
    update(null);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it.each(['통신 끊김', '텔레메트리(Telemetry) 지연'])('샘플 경고 %s를 유지한다', (errorState) => {
    const telemetry = useTelemetryStore.getState().telemetryByRobotId[TEST_ROBOT_ID];
    useTelemetryStore.setState({ telemetryByRobotId: { [TEST_ROBOT_ID]: { ...telemetry, errorState } }, dataSource: 'mock' });
    render(<TelemetryPanel compact />);
    expect(screen.getByRole('status')).toHaveTextContent(errorState);
  });

  it('수신 정상·DB 저장 대기·복구 후 누락 가능성을 독립적으로 안내한다', () => {
    const store = useTelemetryStore.getState();
    const sample = store.telemetryByRobotId[TEST_ROBOT_ID];
    store.upsertTelemetry({ ...sample, lastReceivedAt: new Date().toISOString() });
    store.setConnectionState('connected');
    const received = new Date().toISOString();
    const reception = { state: 'normal' as const, lastReceivedAt: received, edgeSampledAt: null };
    store.upsertReception(TEST_ROBOT_ID, { ...reception, checkedAt: new Date(Date.now() + 1).toISOString(),
      recording: { state: 'buffered', possibleGap: false } });
    render(<TelemetryPanel compact />);
    expect(screen.getByLabelText('텔레메트리 수신 상태')).toHaveTextContent('정상');
    expect(screen.getByLabelText('서버 기록 상태')).toHaveTextContent('DB 저장 대기');
    act(() => store.upsertReception(TEST_ROBOT_ID, { ...reception, checkedAt: new Date(Date.now() + 2).toISOString(),
      recording: { state: 'available', possibleGap: true } }));
    expect(screen.getByLabelText('서버 기록 상태')).toHaveTextContent('DB 기록 가능 · 일부 기록 누락 가능');
    act(() => store.setConnectionState('disconnected'));
    expect(screen.getByLabelText('서버 기록 상태')).toHaveTextContent('현재 DB 기록 상태 확인 불가');
  });

  it('추가 메시지가 없어도 정확히 3초부터 지연 표시로 바뀐다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T00:00:00Z'));
    const telemetry = useTelemetryStore.getState().telemetryByRobotId[TEST_ROBOT_ID];
    useTelemetryStore.getState().upsertTelemetry({ ...telemetry, lastReceivedAt: new Date().toISOString() });
    render(<TelemetryPanel />);
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.queryByText('지연')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText('지연')).toBeInTheDocument();
  });

  it('핵심 텔레메트리를 한국어 요약으로 표시한다', () => {
    render(<TelemetryPanel compact />);

    expect(screen.getByRole('heading', { name: '예초 중' })).toBeInTheDocument();
    expect(screen.getByText('82%')).toBeInTheDocument();
    expect(screen.getByText('자율 주행')).toBeInTheDocument();
    expect(screen.getByText('예초 중')).toBeInTheDocument();
    expect(screen.getByText('0.8 m/s')).toBeInTheDocument();
    expect(screen.getByText('샘플 위치')).toBeInTheDocument();
    expect(screen.getByText('온라인')).toBeInTheDocument();
    expect(screen.getByLabelText('텔레메트리 수신 상태')).toBeInTheDocument();
  });

  it('센서 미수신과 실제 0 값을 구분하고 나중에 도착한 값을 표시한다', () => {
    const telemetry = useTelemetryStore.getState().telemetryByRobotId[TEST_ROBOT_ID];
    const partial = { ...telemetry, latitude: null, longitude: null, batteryLevel: null,
      speedMps: null, signalStrength: null, mode: null, workState: null };
    act(() => useTelemetryStore.getState().upsertTelemetry(partial));
    render(<TelemetryPanel />);
    expect(screen.getAllByText('미수신')).toHaveLength(3);
    expect(screen.getByText('모드 미수신')).toBeInTheDocument();
    expect(screen.getByText('작업 상태 미수신')).toBeInTheDocument();
    expect(screen.getByText('위치 수신 대기')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.queryByText('0.0 m/s')).not.toBeInTheDocument();

    act(() => useTelemetryStore.getState().upsertTelemetry({ ...partial, batteryLevel: 0, speedMps: 0 }));
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('0.0 m/s')).toBeInTheDocument();
  });

  it('GPS만 수신한 compact 요약은 나머지 센서를 미수신으로 표시한다', () => {
    const telemetry = useTelemetryStore.getState().telemetryByRobotId[TEST_ROBOT_ID];
    act(() => useTelemetryStore.getState().upsertTelemetry({ ...telemetry, batteryLevel: null,
      speedMps: null, signalStrength: null, mode: null, workState: null }));
    render(<TelemetryPanel compact />);
    expect(screen.getByRole('heading', { name: '작업 상태 미수신' })).toBeInTheDocument();
    expect(screen.getAllByText('미수신')).toHaveLength(2);
    expect(screen.getByText('모드 미수신')).toBeInTheDocument();
    expect(screen.getByText('GPS 수신')).toBeInTheDocument();
  });

  it('미수신 안내에서 텔레메트리를 수신하면 작업 상태와 배터리 요약으로 전환한다', () => {
    const telemetry = useTelemetryStore.getState().telemetryByRobotId[TEST_ROBOT_ID];
    useTelemetryStore.setState({ telemetryByRobotId: {}, receptionByRobotId: {}, dataSource: 'real' });
    render(<TelemetryPanel compact />);

    expect(screen.getByRole('heading', { name: '텔레메트리 수신 대기' })).toBeInTheDocument();
    expect(screen.getByLabelText('텔레메트리 수신 상태')).toHaveTextContent('미수신');
    expect(screen.queryByText('배터리')).not.toBeInTheDocument();

    act(() => useTelemetryStore.getState().upsertTelemetry(telemetry));

    expect(screen.queryByRole('heading', { name: '텔레메트리 수신 대기' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '예초 중' })).toBeInTheDocument();
    expect(screen.getByText('82%')).toBeInTheDocument();
  });

  it('0,0 좌표는 GPS 미수신 상태로 표시한다', () => {
    const telemetry = useTelemetryStore.getState().telemetryByRobotId[TEST_ROBOT_ID];
    useTelemetryStore.setState({
      telemetryByRobotId: {
        ...useTelemetryStore.getState().telemetryByRobotId,
        [TEST_ROBOT_ID]: {
          ...telemetry,
          latitude: 0,
          longitude: 0,
        },
      },
    });

    render(<TelemetryPanel compact />);

    expect(screen.getByText('GPS 미수신')).toBeInTheDocument();
  });

  it('compact 화면에서는 위경도 좌표를 표시하지 않는다', () => {
    render(<TelemetryPanel compact />);

    expect(screen.queryByText('위도')).not.toBeInTheDocument();
    expect(screen.queryByText('경도')).not.toBeInTheDocument();
  });

  it('수신 시점과 샘플 출처를 요약에서 유지한다', () => {
    render(<TelemetryPanel compact />);
    expect(screen.getByText('마지막 수신')).toBeInTheDocument();
    expect(screen.getByText(/샘플 텔레메트리/)).toBeInTheDocument();
    expect(screen.getByLabelText('텔레메트리 수신 상태')).toBeInTheDocument();
  });
});
