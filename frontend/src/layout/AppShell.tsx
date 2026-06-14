import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../app/providers/authContext';
import { EmergencyStopStatus } from '../features/control/EmergencyStopButton';
import { RecentEventsPanel } from '../features/logs/components/RecentEventsPanel';
import { RobotList } from '../features/robots/components/RobotList';
import { ProtocolIndicators } from '../features/telemetry/components/ProtocolIndicators';
import { TelemetryPanel } from '../features/telemetry/components/TelemetryPanel';
import { VideoPanel } from '../features/video/components/VideoPanel';

const navigationItems = [
  { to: '/map', label: '지도 보기' },
  { to: '/history', label: '작업 이력' },
  { to: '/logs', label: '로그 뷰어' },
  { to: '/settings', label: '설정' },
];

export function AppShell() {
  const { user } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">AM</span>
          <div>
            <p className="eyebrow">자율주행 예초기</p>
            <h1>Fleet Operations Console</h1>
          </div>
        </div>
        <div className="header-operations">
          <ProtocolIndicators />
          <EmergencyStopStatus />
          <div className="profile-block">
            <span>{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}</span>
            <strong>{user?.name ?? '게스트'}</strong>
          </div>
        </div>
      </header>

      <aside className="app-sidebar" aria-label="장비 탐색 및 요약">
        <nav className="nav-list" aria-label="Primary navigation">
          {navigationItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <RobotList />
        <TelemetryPanel compact />
      </aside>

      <main className="app-main">
        <Outlet />
      </main>

      <aside className="app-status" aria-label="영상 및 이벤트 상태">
        <VideoPanel />
        <RecentEventsPanel />
      </aside>
    </div>
  );
}
