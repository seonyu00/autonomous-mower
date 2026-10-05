import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../app/providers/authContext';
import { EmergencyStopButton } from '../features/control/EmergencyStopButton';
import { ControlPanel } from '../features/control/ControlPanel';
import { RecentEventsPanel } from '../features/logs/components/RecentEventsPanel';
import { RobotList } from '../features/robots/components/RobotList';
import { ProtocolIndicators } from '../features/telemetry/components/ProtocolIndicators';
import { TelemetryPanel } from '../features/telemetry/components/TelemetryPanel';
import { VideoPanel } from '../features/video/components/VideoPanel';
import { useRobotStore } from '../features/robots/robotStore';
import { env } from '../shared/config/env';

const navigationItems = [
  { to: '/map', label: '지도 보기', title: '작업 관제', icon: 'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2V5zm6-2v16m6-14v16' },
  { to: '/history', label: '작업 이력', title: '작업 이력', icon: 'M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0' },
  { to: '/logs', label: '로그 뷰어', title: '이벤트 로그', icon: 'M14 3H5v18h14V8l-5-5zm0 0v5h5M8 12h8m-8 4h8' },
  { to: '/settings', label: '설정', title: '설정', icon: 'M4 7h16M4 17h16M8 4v6m8 4v6' },
];

export function AppShell() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const routePath = pathname.replace(/\/$/, '');
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const title = navigationItems.find((item) => item.to === routePath)?.title ?? '작업 관제';
  const sampleMode = env.enableMockAuth || env.enableMockRealtime || env.enableMockControl || env.enableMockRobots || env.enableMockVideo;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">AM</span>
          <h1>예초기 관제</h1>
        </div>
        {sampleMode ? <p className="environment-notice">개발 환경 · 샘플 모드 포함</p> : null}
        <div className="header-operations">
          <ProtocolIndicators />
          <div className="profile-block">
            <span>{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}</span>
            <strong>{user?.name ?? '게스트'}</strong>
          </div>
        </div>
        <div className="header-safety" role="group" aria-label="비상 정지 안전 영역">
          <EmergencyStopButton compact />
        </div>
      </header>

      <aside className="app-sidebar" aria-label="장비 탐색 및 요약">
        <nav className="nav-list" aria-label="주요 메뉴">
          {navigationItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={item.icon} />
              </svg>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <RobotList />
      </aside>

      <section className="fleet-overview" aria-label="선택 장비 상태 요약">
        <div className="fleet-overview-heading">
          <h2>{title}</h2>
          <p>{selectedRobotId ?? '장비 선택 대기'} <span>/ 선택 장비</span></p>
        </div>
        <TelemetryPanel compact />
      </section>

      <main className="app-main">
        <Outlet />
      </main>

      <aside className="app-status" aria-label="영상 및 이벤트 상태">
        <VideoPanel />
        <RecentEventsPanel />
      </aside>

      {routePath === '/map' ? (
        <section className="workspace-panel map-console-controls" aria-label="하단 운용 제어">
          <div className="panel-heading compact"><h2>작업 제어</h2></div>
          <div className="map-control-content"><ControlPanel compact /></div>
        </section>
      ) : null}
    </div>
  );
}
