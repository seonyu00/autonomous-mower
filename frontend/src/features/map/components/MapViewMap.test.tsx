import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStores, TEST_ROBOT_ID } from '../../../test/testStores';
import { useRobotStore } from '../../robots/robotStore';
import { useTelemetryStore } from '../../telemetry/telemetryStore';
import { useZoneStore } from '../zoneStore';
import { MapViewMap } from './MapViewMap';

vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn(() => {
      throw new Error('WebGL 초기화 실패');
    }),
    NavigationControl: vi.fn(),
    AttributionControl: vi.fn(),
  },
}));

describe('MapViewMap', () => {
  beforeEach(() => {
    resetStores();
    useRobotStore.setState({
      robots: [
        {
          id: 'MOWER-01',
          modelName: 'Jetson Orin Local Integration Mock',
          connectionState: 'offline',
          active: true,
        },
      ],
      selectedRobotId: 'MOWER-01',
    });
  });

  afterEach(cleanup);

  it('MapLibre 초기화 실패 시 경고와 관제용 fallback layer를 표시한다', async () => {
    render(<MapViewMap />);

    expect(await screen.findByRole('alert')).toHaveTextContent('지도를 초기화하지 못했습니다.');
    expect(screen.getByRole('alert')).toHaveTextContent('Fallback 지도 표시 중');
    expect(screen.getByLabelText('지도 대체 운용 화면')).toBeInTheDocument();
    expect(screen.getByLabelText('대체 작업 구역')).toBeInTheDocument();
    expect(screen.getByLabelText('대체 샘플 경로')).toBeInTheDocument();
    expect(screen.getByLabelText('대체 로봇 위치')).toHaveTextContent('MOWER-01');
  });

  it('좌표가 0,0이면 유효 위치 대신 수신 대기 상태를 표시한다', async () => {
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

    render(<MapViewMap />);

    expect(await screen.findByText('위치 수신 대기')).toBeInTheDocument();
    expect(screen.getByText('GPS 미수신')).toBeInTheDocument();
    expect(screen.getByText('샘플 운용 데이터')).toBeInTheDocument();
    expect(screen.getByText('샘플 완료 경로')).toBeInTheDocument();
    expect(screen.getByText('샘플 예정 경로')).toBeInTheDocument();
    expect(screen.getByText(/샘플 방향/)).toBeInTheDocument();
    expect(screen.queryByText('0.00000, 0.00000')).not.toBeInTheDocument();
  });

  it('실제 좌표가 연속 수신되면 세션 경로 기준 방향을 표시한다', async () => {
    useTelemetryStore.getState().setConnectionState('connected');
    render(<MapViewMap />);

    const telemetry = useTelemetryStore.getState().telemetryByRobotId[TEST_ROBOT_ID];
    act(() => {
      useTelemetryStore.getState().upsertTelemetry({
        ...telemetry,
        latitude: telemetry.latitude + 0.0001,
        lastReceivedAt: new Date().toISOString(),
      });
    });

    expect(await screen.findByText('GPS 위치 · 샘플 예정 경로')).toBeInTheDocument();
    expect(screen.getByText(/GPS 방향/)).toBeInTheDocument();
    expect(screen.getByText('세션 완료 경로')).toBeInTheDocument();
  });

  it('Mock 연결의 유효 좌표는 실제 GPS가 아니라 샘플 데이터로 표시한다', async () => {
    render(<MapViewMap />);

    expect(await screen.findByText('샘플 운용 데이터')).toBeInTheDocument();
    expect(screen.getByText('샘플 위치')).toBeInTheDocument();
    expect(screen.queryByText('GPS 위치 · 샘플 예정 경로')).not.toBeInTheDocument();
  });

  it('fallback 지도 편집 중 클릭한 위치를 작업 구역 꼭짓점으로 추가한다', async () => {
    useZoneStore.getState().startEditing('MOWER-01');
    render(<MapViewMap />);

    const editingMap = await screen.findByLabelText('작업 구역 편집 지도');
    vi.spyOn(editingMap, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 50,
      width: 1000,
      height: 620,
      right: 1100,
      bottom: 670,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    });

    fireEvent.click(editingMap, {
      clientX: 600,
      clientY: 360,
    });

    expect(useZoneStore.getState().draftVerticesByRobotId['MOWER-01']).toEqual([
      [127.45625, 36.6284],
    ]);
  });
});
