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
  EmergencyStopButton: () => <button type="button">긴급 정지</button>,
}));

vi.mock('../features/control/ControlPanel', () => ({
  ControlPanel: () => <div>compact 제어 패널</div>,
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
  it('상단에 장비 요약을 배치하고 탐색과 영상 영역을 분리한다', () => {
    render(
      <MemoryRouter initialEntries={['/map']}>
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      </MemoryRouter>,
    );

    const sidebar = screen.getByRole('complementary', { name: '장비 탐색 및 요약' });
    const statusPanel = screen.getByRole('complementary', { name: '영상 및 이벤트 상태' });

    const overview = screen.getByRole('region', { name: '선택 장비 상태 요약' });
    expect(within(overview).getByText('compact 텔레메트리')).toBeInTheDocument();
    expect(within(sidebar).queryByText('compact 텔레메트리')).not.toBeInTheDocument();
    expect(within(sidebar).getByText('로봇 목록 컴포넌트')).toBeInTheDocument();
    expect(within(statusPanel).queryByText('일반 텔레메트리')).not.toBeInTheDocument();
    expect(within(statusPanel).getByText('실시간 카메라')).toBeInTheDocument();
    expect(within(statusPanel).getByText('최근 이벤트')).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByRole('button', { name: '긴급 정지' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '긴급 정지' })).toHaveLength(1);
    expect(within(screen.getByRole('region', { name: '하단 운용 제어' })).getByText('compact 제어 패널')).toBeInTheDocument();
  });

  it('이력 화면에는 지도 전용 제어 바를 표시하지 않는다', () => {
    render(<MemoryRouter initialEntries={['/history']}><AuthProvider><AppShell /></AuthProvider></MemoryRouter>);
    expect(screen.queryByRole('region', { name: '하단 운용 제어' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByRole('button', { name: '긴급 정지' })).toBeInTheDocument();
  });

  it('지도 주소 끝에 슬래시가 있어도 제어 바를 유지한다', () => {
    render(<MemoryRouter initialEntries={['/map/']}><AuthProvider><AppShell /></AuthProvider></MemoryRouter>);
    expect(screen.getByRole('region', { name: '하단 운용 제어' })).toBeInTheDocument();
  });
});
