import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStores, TEST_ROBOT_ID } from '../../../test/testStores';
import { useRobotStore } from '../../robots/robotStore';
import { useTelemetryStore } from '../../telemetry/telemetryStore';
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
    expect(screen.queryByText('0.00000, 0.00000')).not.toBeInTheDocument();
  });
});
