import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../app/providers/authContext';
import { EmergencyStopButton } from '../features/control/EmergencyStopButton';
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
        <div>
          <p className="eyebrow">자율주행 예초기</p>
          <h1>관제 대시보드</h1>
        </div>
        <ProtocolIndicators />
        <EmergencyStopButton />
        <div className="profile-block">
          <span>{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}</span>
          <strong>{user?.name ?? '게스트'}</strong>
        </div>
      </header>

      <aside className="app-sidebar">
        <nav className="nav-list" aria-label="Primary navigation">
          {navigationItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <RobotList />
      </aside>

      <main className="app-main">
        <Outlet />
      </main>

      <aside className="app-status">
        <TelemetryPanel />
        <VideoPanel />
      </aside>
    </div>
  );
}
