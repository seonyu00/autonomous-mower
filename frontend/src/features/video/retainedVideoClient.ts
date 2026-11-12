import { WebRTCClient } from './WebRtcClient';
import { useAuthStore } from '../auth/authStore';
import { useRobotStore } from '../robots/robotStore';
import { hasPermission } from '../../shared/lib/permissions';
import { useVideoStore } from './videoStore';

const GRACE_MS = 180_000;
let retained: { robotId: string; session: number; client: WebRTCClient; attached: boolean;
  deadline: number | null; resumeOnReturn: boolean; timer?: ReturnType<typeof setTimeout>; dispose: () => void } | null = null;

export function stopRetainedVideo() {
  const current = retained;
  if (!current) return;
  retained = null;
  clearTimeout(current.timer);
  current.dispose();
  void current.client.stopStream();
}

function updateRetention() {
  const current = retained;
  if (!current) return;
  const visible = current.attached && document.visibilityState !== 'hidden';
  const state = useVideoStore.getState().getSession(current.robotId).connectionState;
  if (!visible) {
    current.resumeOnReturn ||= ['connecting', 'connected', 'reconnecting'].includes(state);
    useVideoStore.getState().patchSession(current.robotId, { frameReceiving: false });
  }
  if (visible && (current.deadline === null || Date.now() < current.deadline)) {
    clearTimeout(current.timer);
    current.deadline = null;
    if (current.resumeOnReturn && ['failed', 'disconnected'].includes(state)) void current.client.reconnect(current.robotId);
    current.resumeOnReturn = false;
    return;
  }
  if (current.deadline === null) current.deadline = Date.now() + GRACE_MS;
  clearTimeout(current.timer);
  const remaining = current.deadline - Date.now();
  if (remaining <= 0) {
    current.deadline = null;
    current.resumeOnReturn = false;
    if (current.attached) void current.client.stopStream();
    else stopRetainedVideo();
  }
  else current.timer = setTimeout(updateRetention, remaining);
}

export function acquireVideoClient(robotId: string, session: number) {
  if (retained && (retained.robotId !== robotId || retained.session !== session)) stopRetainedVideo();
  if (retained?.deadline != null && Date.now() >= retained.deadline) stopRetainedVideo();
  if (!retained) {
    const unsubscribeAuth = useAuthStore.subscribe(state => {
      if (state.sessionVersion !== session || !state.isAuthenticated || !state.user
          || !hasPermission(state.user.role, 'telemetry:read')) stopRetainedVideo();
    });
    const unsubscribeRobot = useRobotStore.subscribe(state => {
      if (state.selectedRobotId !== robotId) stopRetainedVideo();
    });
    document.addEventListener('visibilitychange', updateRetention);
    window.addEventListener('pagehide', stopRetainedVideo);
    window.addEventListener('beforeunload', stopRetainedVideo);
    retained = { robotId, session, client: new WebRTCClient(), attached: true, deadline: null, resumeOnReturn: false,
      dispose: () => {
        unsubscribeAuth(); unsubscribeRobot();
        document.removeEventListener('visibilitychange', updateRetention);
        window.removeEventListener('pagehide', stopRetainedVideo);
        window.removeEventListener('beforeunload', stopRetainedVideo);
      } };
  }
  retained.attached = true;
  updateRetention();
  return retained!.client;
}

export function retainVideoClient(client: WebRTCClient) {
  if (retained?.client !== client) return;
  retained.attached = false;
  useVideoStore.getState().patchSession(retained.robotId, { frameReceiving: false });
  updateRetention();
}
