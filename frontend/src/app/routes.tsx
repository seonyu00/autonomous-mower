import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { AppShell } from '../layout/AppShell';
import { LoginPage } from '../pages/LoginPage';
import { MapViewPage } from '../pages/MapViewPage';
import { HistoryPage } from '../pages/HistoryPage';
import { LogViewerPage } from '../pages/LogViewerPage';
import { SettingsPage } from '../pages/SettingsPage';

export const routes: RouteObject[] = [
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/map" replace /> },
      { path: 'map', element: <MapViewPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'logs', element: <LogViewerPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/map" replace />,
  },
];
