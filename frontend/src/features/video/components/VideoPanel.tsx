import { useEffect, useMemo, useRef } from 'react';
import { Button } from '../../../shared/ui/Button';
import { hasPermission } from '../../../shared/lib/permissions';
import { useAuthStore } from '../../auth/authStore';
import { useRobotStore } from '../../robots/robotStore';
import { createDefaultVideoSession, useVideoStore } from '../videoStore';
import { WebRTCClient } from '../WebRtcClient';
import { captureVideoFrame } from '../captureVideoFrame';
import { uploadManualSnapshot } from '../snapshotApi';

export function VideoPanel() {
  const selectedRobotId = useRobotStore((state) => state.selectedRobotId);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const sessionsByRobotId = useVideoStore((state) => state.sessionsByRobotId);
  const patchSession = useVideoStore((state) => state.patchSession);
  const setSnapshot = useVideoStore((state) => state.setSnapshot);
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
      return '로봇 없음';
    }

    return session?.connectionState ?? 'idle';
  }, [selectedRobotId, session?.connectionState]);

  const startDisabled = !selectedRobotId || !canUseVideo || session?.loading || session?.connectionState === 'connected';
  const stopDisabled = !selectedRobotId || session?.loading || !['connected', 'failed', 'reconnecting'].includes(session?.connectionState ?? '');
  const reconnectDisabled =
    !selectedRobotId || !canUseVideo || session?.loading || !['connected', 'failed', 'disconnected'].includes(session?.connectionState ?? '');
  const snapshotDisabled =
    !selectedRobotId ||
    !canUseVideo ||
    session?.connectionState !== 'connected' ||
    session?.snapshotLoading;

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

  const handleSnapshot = async () => {
    if (!selectedRobotId || !canUseVideo || !videoRef.current) {
      return;
    }

    patchSession(selectedRobotId, { snapshotLoading: true, snapshotError: null });

    try {
      const capturedAt = new Date().toISOString();
      const jpeg = await captureVideoFrame(videoRef.current);
      const snapshot = await uploadManualSnapshot(selectedRobotId, capturedAt, jpeg);
      setSnapshot(selectedRobotId, snapshot);
      patchSession(selectedRobotId, { snapshotLoading: false });
    } catch (error) {
      patchSession(selectedRobotId, {
        snapshotLoading: false,
        snapshotError: error instanceof Error ? error.message : '스냅샷을 저장하지 못했습니다.',
      });
    }
  };

  return (
    <section className="video-panel" aria-label="실시간 카메라 영상 패널">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">영상</p>
          <h2>실시간 카메라</h2>
        </div>
        <span className={statusClassName(session?.connectionState ?? 'idle')}>{statusText}</span>
      </div>

      <div className="video-frame">
        {session?.stream ? (
          <video ref={videoRef} className="video-element" autoPlay muted playsInline aria-label="로봇 실시간 카메라 스트림" />
        ) : (
          <div className="mock-video-placeholder" aria-label="샘플 영상 영역">
            <span>{session?.loading ? '스트림 연결 중' : '카메라 스트림 대기 중'}</span>
            <small>{selectedRobotId ?? '로봇 선택'}</small>
          </div>
        )}
        <div className="video-status-overlay" aria-label="영상 수신 정보">
          <span>{session?.qualityPolicy.width ?? 640}×{session?.qualityPolicy.height ?? 480} 요청</span>
          <span>최소 {session?.qualityPolicy.minFps ?? 15} FPS</span>
          <span>지연 미수집</span>
          <span className={session?.connectionState === 'connected' ? 'recording-state live' : 'recording-state'}>
            {session?.connectionState === 'connected' ? 'LIVE' : 'STANDBY'}
          </span>
        </div>
      </div>

      <div className="video-actions">
        <Button type="button" variant="primary" disabled={startDisabled} onClick={() => void handleStart()}>
          스트림 시작
        </Button>
        <Button type="button" disabled={stopDisabled} onClick={() => void handleStop()}>
          스트림 중지
        </Button>
        <Button type="button" disabled={reconnectDisabled} onClick={() => void handleReconnect()}>
          재연결
        </Button>
        <Button type="button" disabled={snapshotDisabled} onClick={() => void handleSnapshot()}>
          {session?.snapshotLoading ? '저장 중' : '스냅샷'}
        </Button>
      </div>

      {session?.loading ? <p className="muted">WebRTC 세션을 준비하는 중입니다.</p> : null}
      {session?.error ? <p className="warning-line">{session.error}</p> : null}
      {session?.snapshotError ? <p className="warning-line">{session.snapshotError}</p> : null}
      {session?.connectionState === 'disconnected' ? <p className="muted">영상 스트림 연결이 끊겼습니다.</p> : null}
      {!canUseVideo ? <p className="warning-line">온디맨드 영상을 보려면 텔레메트리(Telemetry) 권한이 필요합니다.</p> : null}

      <div className="video-policy" aria-label="WebRTC 스트림 정책">
        <span>녹화 OFF</span>
        <span>마지막 프레임 미수집</span>
        <span>세션 시작 {session?.lastStartedAt ? new Date(session.lastStartedAt).toLocaleTimeString() : '미시작'}</span>
        <span>{session?.qualityPolicy.maxBitrateKbps ?? 500}kbps 제한</span>
      </div>

      <div className="snapshot-placeholder compact" aria-label="스냅샷 상태">
        <span>스냅샷</span>
        <small>
          {session?.snapshot ? `${new Date(session.snapshot.capturedAt).toLocaleTimeString()} 저장됨` : '캡처된 스냅샷 없음'}
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
