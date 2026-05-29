import { useEffect, useMemo, useRef } from 'react';
import { Button } from '../../../shared/ui/Button';
import { hasPermission } from '../../../shared/lib/permissions';
import { useAuthStore } from '../../auth/authStore';
import { useRobotStore } from '../../robots/robotStore';
import { createDefaultVideoSession, useVideoStore } from '../videoStore';
import { WebRTCClient } from '../WebRtcClient';

export function VideoPanel() {
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const sessionsByRobotId = useVideoStore((state) => state.sessionsByRobotId);
  const requestSnapshot = useVideoStore((state) => state.requestSnapshot);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const clientRef = useRef<WebRTCClient | null>(null);
  const previousRobotIdRef = useRef<string | null>(null);

  const session = selectedRobotId
    ? sessionsByRobotId[selectedRobotId] ?? createDefaultVideoSession(selectedRobotId)
    : null;
  const canUseVideo = Boolean(isAuthenticated && user && hasPermission(user.role, 'telemetry:read'));
  const activeVideoStates = ['connecting', 'connected', 'reconnecting'];
  const hasActiveStream = Boolean(session && activeVideoStates.includes(session.connectionState));

  useEffect(() => {
    clientRef.current = new WebRTCClient({
      onRemoteStream: (stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      },
    });

    return () => {
      void clientRef.current?.stopStream();
    };
  }, []);

  useEffect(() => {
    const previousRobotId = previousRobotIdRef.current;

    if (previousRobotId && previousRobotId !== selectedRobotId) {
      void clientRef.current?.stopStream(previousRobotId);
    }

    previousRobotIdRef.current = selectedRobotId;
  }, [selectedRobotId]);

  useEffect(() => {
    if (!canUseVideo && selectedRobotId && hasActiveStream) {
      void clientRef.current?.stopStream(selectedRobotId);
    }
  }, [canUseVideo, hasActiveStream, selectedRobotId]);

  useEffect(() => {
    const stopCurrentStream = () => {
      void clientRef.current?.stopStream();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stopCurrentStream();
      }
    };

    window.addEventListener('pagehide', stopCurrentStream);
    window.addEventListener('beforeunload', stopCurrentStream);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', stopCurrentStream);
      window.removeEventListener('beforeunload', stopCurrentStream);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (videoRef.current && session?.stream) {
      videoRef.current.srcObject = session.stream;
    }
  }, [session?.stream]);

  const statusText = useMemo(() => {
    if (!selectedRobotId) {
      return 'No robot';
    }

    return session?.connectionState ?? 'idle';
  }, [selectedRobotId, session?.connectionState]);

  const startDisabled = !selectedRobotId || !canUseVideo || session?.loading || session?.connectionState === 'connected';
  const stopDisabled = !selectedRobotId || session?.loading || !['connected', 'failed', 'reconnecting'].includes(session?.connectionState ?? '');
  const reconnectDisabled =
    !selectedRobotId || !canUseVideo || session?.loading || !['connected', 'failed', 'disconnected'].includes(session?.connectionState ?? '');
  const snapshotDisabled = !selectedRobotId || !canUseVideo;

  const handleStart = async () => {
    if (!selectedRobotId) {
      return;
    }

    await clientRef.current?.startStream(selectedRobotId);
  };

  const handleStop = async () => {
    if (!selectedRobotId) {
      return;
    }

    await clientRef.current?.stopStream(selectedRobotId);
  };

  const handleReconnect = async () => {
    if (!selectedRobotId) {
      return;
    }

    await clientRef.current?.reconnect(selectedRobotId);
  };

  const handleSnapshot = () => {
    if (!selectedRobotId || !canUseVideo) {
      return;
    }

    requestSnapshot(selectedRobotId);
  };

  return (
    <section className="video-panel" aria-label="Live camera video panel">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Video</p>
          <h2>Live Camera</h2>
        </div>
        <span className={statusClassName(session?.connectionState ?? 'idle')}>{statusText}</span>
      </div>

      <div className="video-frame">
        {session?.stream ? (
          <video ref={videoRef} className="video-element" autoPlay muted playsInline aria-label="Live robot camera stream" />
        ) : (
          <div className="mock-video-placeholder" aria-label="Mock video placeholder">
            <span>{session?.loading ? 'Connecting stream' : 'Camera stream placeholder'}</span>
            <small>{selectedRobotId ?? 'Select a robot'}</small>
          </div>
        )}
      </div>

      <div className="video-actions">
        <Button type="button" variant="primary" disabled={startDisabled} onClick={() => void handleStart()}>
          Start Stream
        </Button>
        <Button type="button" disabled={stopDisabled} onClick={() => void handleStop()}>
          Stop Stream
        </Button>
        <Button type="button" disabled={reconnectDisabled} onClick={() => void handleReconnect()}>
          Reconnect
        </Button>
        <Button type="button" disabled={snapshotDisabled} onClick={handleSnapshot}>
          Snapshot
        </Button>
      </div>

      {session?.loading ? <p className="muted">Loading WebRTC session through mock signalling.</p> : null}
      {session?.error ? <p className="warning-line">{session.error}</p> : null}
      {session?.connectionState === 'disconnected' ? <p className="muted">Video stream is disconnected.</p> : null}
      {!canUseVideo ? <p className="warning-line">Telemetry permission is required for on-demand video.</p> : null}

      <div className="video-policy" aria-label="WebRTC stream policy">
        <span>{session?.qualityPolicy.minFps ?? 15}fps minimum</span>
        <span>
          {session?.qualityPolicy.width ?? 640}x{session?.qualityPolicy.height ?? 480}
        </span>
        <span>{session?.qualityPolicy.maxBitrateKbps ?? 500}kbps max</span>
      </div>

      <div className="snapshot-placeholder compact" aria-label="Snapshot placeholder">
        <span>Snapshot placeholder</span>
        <small>
          {session?.snapshot ? `Requested ${new Date(session.snapshot.capturedAt).toLocaleTimeString()}` : 'No snapshot captured'}
        </small>
      </div>
    </section>
  );
}

function statusClassName(state: string) {
  if (state === 'connected') {
    return 'status-pill connected';
  }

  if (state === 'failed' || state === 'disconnected') {
    return 'status-pill offline';
  }

  return 'status-pill degraded';
}
