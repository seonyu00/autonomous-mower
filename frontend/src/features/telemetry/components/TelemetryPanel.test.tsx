import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetStores, TEST_ROBOT_ID } from '../../../test/testStores';
import { useTelemetryStore } from '../telemetryStore';
import { TelemetryPanel } from './TelemetryPanel';

describe('TelemetryPanel compact summary', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(cleanup);

  it('좁은 사이드바용 핵심 텔레메트리를 compact하게 표시한다', () => {
    render(<TelemetryPanel compact />);

    expect(screen.getByRole('heading', { name: '선택 로봇 요약' })).toBeInTheDocument();
    expect(screen.getByText('82%')).toBeInTheDocument();
    expect(screen.getByText('AUTONOMOUS')).toBeInTheDocument();
    expect(screen.getByText('MOWING')).toBeInTheDocument();
    expect(screen.getByText('0.8 m/s')).toBeInTheDocument();
    expect(screen.getByText('GPS 수신')).toBeInTheDocument();
    expect(screen.getAllByText('온라인')).toHaveLength(2);
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

  it('핵심 상태와 보조 정보를 시각적 우선순위로 구분한다', () => {
    render(<TelemetryPanel compact />);

    const primary = screen.getByLabelText('핵심 장비 상태');
    const secondary = screen.getByLabelText('보조 텔레메트리');

    expect(within(primary).getByText('배터리')).toBeInTheDocument();
    expect(within(primary).getByText('모드')).toBeInTheDocument();
    expect(within(primary).getByText('작업 상태')).toBeInTheDocument();
    expect(within(primary).getByText('통신 상태')).toBeInTheDocument();
    expect(within(secondary).getByText('GPS / RTK')).toBeInTheDocument();
    expect(within(secondary).getByText('마지막 수신')).toBeInTheDocument();
  });
});
