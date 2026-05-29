import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../app/providers/authContext';
import { RobotList } from '../features/robots/components/RobotList';
import { ProtocolIndicators } from '../features/telemetry/components/ProtocolIndicators';
import { TelemetryPanel } from '../features/telemetry/components/TelemetryPanel';

const navigationItems = [
  { to: '/map', label: 'Map View' },
  { to: '/history', label: 'History' },
  { to: '/logs', label: 'Log Viewer' },
  { to: '/settings', label: 'Settings' },
];

export function AppShell() {
  const { user } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Autonomous Mower</p>
          <h1>Control Dashboard</h1>
        </div>
        <ProtocolIndicators />
        <div className="profile-block">
          <span>{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}</span>
          <strong>{user?.name ?? 'Guest'}</strong>
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
      </aside>
    </div>
  );
}
