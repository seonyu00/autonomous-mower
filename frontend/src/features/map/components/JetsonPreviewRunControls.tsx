import { useEffect, useRef, useState } from 'react';
import { httpClient } from '../../../shared/api/httpClient';
import { useAuthStore } from '../../auth/authStore';
import { useControlStore } from '../../control/controlStore';

type Props = {
  robotId: string;
  zoneId: number;
  zoneVersion: number;
  onSession: (id: string | undefined) => void;
};

export function JetsonPreviewRunControls({ robotId, zoneId, zoneVersion, onSession }: Props) {
  const control = useControlStore(state => state.controlByRobotId[robotId]);
  const userId = useAuthStore(state => state.user?.id);
  const sessionVersion = useAuthStore(state => state.sessionVersion);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState('');
  const cancel = useRef<(() => void) | null>(null);
  const lockVersion = control?.lockState === 'held' && control.controlOwner === userId && !control.emergency
    ? control.lockVersion : undefined;
  // 화면 이탈, 계정 전환 또는 제어권 변경은 연장을 끝낸다.
  useEffect(() => () => cancel.current?.(), [sessionVersion, lockVersion]);

  const start = async () => {
    if (!lockVersion || cancel.current) return;
    const id = crypto.randomUUID();
    const path = `/api/robots/${encodeURIComponent(robotId)}/jetson-route/preview-run`;
    let ended = false;
    let acknowledged = false;
    let timer: number | undefined;
    let request: AbortController | undefined;
    const stop = () => {
      if (ended) return;
      ended = true;
      window.clearTimeout(timer);
      request?.abort();
      window.removeEventListener('offline', disconnected);
      window.removeEventListener('pagehide', stop);
      cancel.current = null;
      onSession(undefined);
      setActive(false);
      if (acknowledged) void httpClient.post(`${path}/${id}/stop`, undefined, { keepalive: true }).catch(() => {});
    };
    const disconnected = () => {
      stop();
      setMessage('연결이 끊겨 무구동 세션 갱신을 중단했습니다.');
    };
    const post = async (suffix: string, body?: unknown) => {
      const controller = new AbortController();
      request = controller;
      const timeout = window.setTimeout(() => controller.abort(), 2000);
      try {
        await httpClient.post(path + suffix, body, { signal: controller.signal });
      } finally {
        window.clearTimeout(timeout);
      }
    };
    const renew = async () => {
      try {
        await post(`/${id}/renew`);
        if (!ended) timer = window.setTimeout(() => void renew(), 1000);
      } catch {
        if (!ended) disconnected();
      }
    };
    cancel.current = stop;
    window.addEventListener('offline', disconnected);
    window.addEventListener('pagehide', stop);
    setActive(true);
    setMessage('Jetson에 무구동 시작을 요청하고 있습니다.');
    try {
      await post('/start', { id, zoneId, zoneVersion, lockVersion });
      if (ended) return;
      acknowledged = true;
      onSession(id);
      setMessage('무구동 경로를 기다리는 중입니다.');
      timer = window.setTimeout(() => void renew(), 1000);
    } catch {
      if (ended) return;
      stop();
      setMessage('시작을 요청하지 못했습니다. 제어권과 Jetson 미리보기 설정을 확인하세요.');
    }
  };

  return <>
    <button type="button" disabled={!active && !lockVersion}
      onClick={() => {
        if (active) {
          cancel.current?.();
          setMessage('무구동 세션 종료를 요청했습니다.');
        } else void start();
      }}>
      {active ? '무구동 종료' : '무구동 시작'}
    </button>
    {!active && !lockVersion && <p>제어권을 얻은 뒤 무구동 계산을 시작하세요.</p>}
    {message && <p role="status">{message}</p>}
  </>;
}
