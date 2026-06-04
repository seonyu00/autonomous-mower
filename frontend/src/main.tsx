import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { AuthProvider } from './app/providers/AuthProvider';
import { QueryProvider } from './app/providers/QueryProvider';
import { RealtimeProvider } from './app/providers/RealtimeProvider';
import { RobotDataProvider } from './features/robots/RobotDataProvider';
import { ErrorBoundary } from './shared/ui/ErrorBoundary';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <QueryProvider>
            <RobotDataProvider>
              <RealtimeProvider>
                <App />
              </RealtimeProvider>
            </RobotDataProvider>
          </QueryProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
