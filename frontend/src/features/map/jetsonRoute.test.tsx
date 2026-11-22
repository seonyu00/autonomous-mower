import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../shared/api/errors';
import { httpClient } from '../../shared/api/httpClient';
import { resetStores } from '../../test/testStores';
import { useJetsonRoute } from './jetsonRoute';

vi.mock('../../shared/api/httpClient', () => ({ httpClient: { get: vi.fn() } }));

const route = {
  robotId: 'A', workZoneId: 2, workZoneVersion: 11, sourceMode: 'preview', status: 'available',
  reason: 'replanned', receivedAt: '2026-11-21T12:00:00Z', serverTime: '2026-11-21T12:00:00Z',
  expiresAt: '2026-11-21T12:00:03Z', remainingPath: [{ lon: 127, lat: 37 }, { lon: 128, lat: 38 }],
};

function Probe({ robot = 'A', version = 11 }: { robot?: string; version?: number }) {
  const display = useJetsonRoute(robot, 2, version, true);
  return <><p role="status">{display.label}</p><output aria-label="경로 좌표">{JSON.stringify(display.path ?? [])}</output></>;
}

beforeEach(() => { resetStores(); vi.useFakeTimers(); vi.mocked(httpClient.get).mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('재계획 경로 교체 후 센서 보류에서 선을 지운다', async () => {
  vi.mocked(httpClient.get).mockResolvedValueOnce(route)
    .mockResolvedValueOnce({ ...route, remainingPath: [...route.remainingPath].reverse() })
    .mockResolvedValueOnce({ ...route, status: 'held', reason: 'sensor_hold', remainingPath: [] });
  render(<Probe />);
  await act(async () => {});
  expect(screen.getByLabelText('경로 좌표')).toHaveTextContent('[[127,37],[128,38]]');
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByLabelText('경로 좌표')).toHaveTextContent('[[128,38],[127,37]]');
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByRole('status', { name: '' })).toHaveTextContent('센서 확인 대기');
  expect(screen.getByLabelText('경로 좌표')).toHaveTextContent('[]');
});

it('다음 요청이 응답하지 않아도 표시 수명 이후 경로를 지운다', async () => {
  vi.mocked(httpClient.get).mockResolvedValueOnce(route).mockImplementationOnce(() => new Promise(() => {}));
  render(<Probe />);
  await act(async () => {});
  await act(async () => { await vi.advanceTimersByTimeAsync(3010); });
  expect(screen.getByText('경로 갱신 끊김')).toBeInTheDocument();
  expect(screen.getByLabelText('경로 좌표')).toHaveTextContent('[]');
});

it('로봇과 구역을 바꾼 후 이전 조회의 늦은 응답을 버린다', async () => {
  let finish!: (response: typeof route) => void;
  vi.mocked(httpClient.get).mockImplementationOnce(() => new Promise(resolve => { finish = resolve as typeof finish; }))
    .mockResolvedValueOnce({ ...route, robotId: 'B', workZoneVersion: 12, status: 'unreported', remainingPath: [] });
  const view = render(<Probe />);
  view.rerender(<Probe robot="B" version={12} />);
  await act(async () => {});
  await act(async () => finish(route));
  expect(screen.getByText('Jetson 경로 수신 대기')).toBeInTheDocument();
  expect(screen.getByLabelText('경로 좌표')).toHaveTextContent('[]');
  expect(httpClient.get).toHaveBeenLastCalledWith('/api/robots/B/jetson-route/latest?workZoneId=2&workZoneVersion=12',
    expect.objectContaining({ cache: 'no-store' }));
});

it('구역 충돌 응답에서 이전 경로를 지운다', async () => {
  vi.mocked(httpClient.get).mockResolvedValueOnce(route)
    .mockRejectedValueOnce(new ApiError('zone', 'validation', 409));
  render(<Probe />);
  await act(async () => {});
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByText('작업 구역이 변경됐습니다. 최신 구역을 불러오세요.')).toBeInTheDocument();
  expect(screen.getByLabelText('경로 좌표')).toHaveTextContent('[]');
});
