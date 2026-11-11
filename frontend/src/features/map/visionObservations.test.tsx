import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetStores } from '../../test/testStores';
import { httpClient } from '../../shared/api/httpClient';
import { useVisionObservations, type VisionMap } from './visionObservations';
import { VisionMapControls } from './components/VisionMapControls';

vi.mock('../../shared/api/httpClient', () => ({ httpClient: { get: vi.fn() } }));
const empty: VisionMap = { robotId: 'A', version: 1, serverTime: '2026-11-11T00:00:00Z', regions: [], dangerHistory: [], nextHistoryCursor: null };
function Probe({ robot = 'A' }: { robot?: string }) {
  const query = useVisionObservations(robot, 1, true);
  return <span>{query.isError ? '조회 실패' : query.data?.robotId ?? '대기'}</span>;
}
beforeEach(() => { resetStores(); vi.useFakeTimers(); vi.mocked(httpClient.get).mockReset(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('로봇 전환 뒤 이전 로봇의 늦은 응답을 버린다', async () => {
  let done!: (data: VisionMap) => void;
  vi.mocked(httpClient.get).mockImplementationOnce(() => new Promise(resolve => { done = resolve as typeof done; }));
  vi.mocked(httpClient.get).mockResolvedValueOnce({ ...empty, robotId: 'B' });
  const view = render(<Probe />);
  view.rerender(<Probe robot="B" />);
  await act(async () => {});
  await act(async () => done(empty));
  expect(screen.getByText('B')).toBeInTheDocument();
});
it('갱신 실패하면 이전 결과를 숨긴다', async () => {
  vi.mocked(httpClient.get).mockResolvedValueOnce(empty).mockRejectedValueOnce(new Error('offline'));
  render(<Probe />); await act(async () => {});
  expect(screen.getByText('A')).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByText('조회 실패')).toBeInTheDocument();
});
it('오래된 위험과 이전 위험 이력, 페이지 이동을 텍스트로 구분한다', () => {
  const danger = { id: 1, observationId: 'risk', version: 1, state: 'DANGEROUS' as const, source: 'fixture', observedAt: empty.serverTime,
    geometry: { type: 'Polygon' as const, coordinates: [] }, stale: true };
  const next = vi.fn();
  render(<VisionMapControls enabled onToggle={vi.fn()} available mapReady loading={false} error={false}
    data={{ ...empty, regions: [danger], dangerHistory: [danger], nextHistoryCursor: 1 }} onNextHistory={next} />);
  act(() => screen.getByText('비전 관측 지도').click());
  expect(screen.getByLabelText('비전 관측 영역')).toHaveTextContent('오래된 정보');
  act(() => screen.getByRole('button', { name: '이전 위험 이력 1건' }).click());
  expect(screen.getByLabelText('위험 관측 이력')).toHaveTextContent('구역 버전 1');
  act(() => screen.getByRole('button', { name: '이전 이력' }).click());
  expect(next).toHaveBeenCalledOnce();
});
it('응답이 멈추면 제한 시간 뒤 이전 결과를 숨기고 재조회한다', async () => {
  vi.mocked(httpClient.get).mockResolvedValueOnce(empty).mockImplementationOnce((_path, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error('timeout')));
  })).mockResolvedValueOnce(empty);
  render(<Probe />); await act(async () => {});
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
  expect(screen.getByText('조회 실패')).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByText('A')).toBeInTheDocument();
});
