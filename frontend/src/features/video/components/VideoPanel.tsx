import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../../shared/ui/Button';
import { useRobotStore } from '../../robots/robotStore';
import { createDefaultVideoSession, useVideoStore } from '../videoStore';
import { WebRTCClient } from '../WebRtcClient';

export function VideoPanel() {
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const sessionsByRobotId = useVideoStore((state) => state.sessionsByRobotId);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const clientRef = useRef<WebRTCClient | null>(null);
  const [snapshotRequestedAt, setSnapshotRequestedAt] = useState<string | null>(null);

  const session = selectedRobotId
    ? sessionsByRobotId[selectedRobotId] ?? createDefaultVideoSession(selectedRobotId)
    : null;

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

  const startDisabled = !selectedRobotId || session?.loading || session?.connectionState === 'connected';
  const stopDisabled = !selectedRobotId || session?.loading || !['connected', 'failed', 'reconnecting'].includes(session?.connectionState ?? '');
  const reconnectDisabled = !selectedRobotId || session?.loading || !['connected', 'failed', 'disconnected'].includes(session?.connectionState ?? '');

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
        <Button type="button" disabled={!selectedRobotId} onClick={() => setSnapshotRequestedAt(new Date().toISOString())}>
          Snapshot
        </Button>
      </div>

      {session?.loading ? <p className="muted">Loading WebRTC session through mock signalling.</p> : null}
      {session?.error ? <p className="warning-line">{session.error}</p> : null}
      {session?.connectionState === 'disconnected' ? <p className="muted">Video stream is disconnected.</p> : null}

      <div className="snapshot-placeholder compact" aria-label="Snapshot placeholder">
        <span>Snapshot placeholder</span>
        <small>{snapshotRequestedAt ? `Requested ${new Date(snapshotRequestedAt).toLocaleTimeString()}` : 'No snapshot captured'}</small>
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
