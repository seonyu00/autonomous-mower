import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../app/providers/AuthProvider';
import { AppShell } from './AppShell';

vi.mock('../features/robots/components/RobotList', () => ({
  RobotList: () => <div>로봇 목록 컴포넌트</div>,
}));

vi.mock('../features/telemetry/components/ProtocolIndicators', () => ({
  ProtocolIndicators: () => <div>통신 상태</div>,
}));

vi.mock('../features/control/EmergencyStopButton', () => ({
  EmergencyStopStatus: () => <div>E-STOP 준비</div>,
}));

vi.mock('../features/telemetry/components/TelemetryPanel', () => ({
  TelemetryPanel: ({ compact }: { compact?: boolean }) => (
    <div>{compact ? 'compact 텔레메트리' : '일반 텔레메트리'}</div>
  ),
}));

vi.mock('../features/video/components/VideoPanel', () => ({
  VideoPanel: () => <div>실시간 카메라</div>,
}));

vi.mock('../features/logs/components/RecentEventsPanel', () => ({
  RecentEventsPanel: () => <div>최근 이벤트</div>,
}));

afterEach(cleanup);

describe('AppShell status placement', () => {
  it('텔레메트리를 왼쪽 사이드바에 배치하고 오른쪽에서는 제거한다', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </MemoryRouter>,
    );

    const sidebar = screen.getByRole('complementary', { name: '장비 탐색 및 요약' });
    const statusPanel = screen.getByRole('complementary', { name: '영상 및 이벤트 상태' });

    expect(within(sidebar).getByText('compact 텔레메트리')).toBeInTheDocument();
    expect(within(statusPanel).queryByText('일반 텔레메트리')).not.toBeInTheDocument();
    expect(within(statusPanel).getByText('실시간 카메라')).toBeInTheDocument();
    expect(within(statusPanel).getByText('최근 이벤트')).toBeInTheDocument();
  });
});
