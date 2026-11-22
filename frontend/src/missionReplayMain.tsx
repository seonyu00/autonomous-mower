import { createRoot } from 'react-dom/client';
import { MissionReplayPage } from './features/history/MissionReplayPage';
import './features/history/missionReplay.css';

createRoot(document.getElementById('root')!).render(<MissionReplayPage />);
