import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadNaverMaps, subscribeNaverMapsAuthFailure } from '../../map/naverMapsLoader';
import type { HistoryEntry } from '../types';
import { HistoryMap } from './HistoryMap';

const naverMock = vi.hoisted(() => {
  const maps = {
    MapTypeId: { SATELLITE: 'satellite' },
    Position: { TOP_RIGHT: 3 },
    LatLng: vi.fn(function MockLatLng(lat: number, lng: number) {
      return { lat: () => lat, lng: () => lng };
    }),
    LatLngBounds: vi.fn(function MockBounds() {
      return { extend: vi.fn() };
    }),
    Map: vi.fn(function MockMap() {
      return {
        fitBounds: vi.fn(),
        destroy: vi.fn(),
      };
    }),
    Polyline: vi.fn(function MockPolyline() {
      return { setMap: vi.fn() };
    }),
    Marker: vi.fn(function MockMarker() {
      return { setMap: vi.fn() };
    }),
  };

  return { maps };
});

vi.mock('../../map/naverMapsLoader', () => ({
  loadNaverMaps: vi.fn(),
  subscribeNaverMapsAuthFailure: vi.fn(() => vi.fn()),
}));

const selectedEntry: HistoryEntry = {
  id: 'history-1',
  robotId: 'MOWER-01',
  startedAt: '2026-06-15T09:00:00+09:00',
  endedAt: '2026-06-15T10:00:00+09:00',
  distanceMeters: 120,
  route: {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: [[127.454, 36.626], [127.455, 36.625]],
    },
  },
  events: [
    {
      id: 'event-1',
      robotId: 'MOWER-01',
      occurredAt: '2026-06-15T09:30:00+09:00',
      severity: 'warning',
      type: 'obstacle-detected',
      message: '장애물 감지',
      location: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Point',
          coordinates: [127.4545, 36.6255],
        },
      },
    },
  ],
};

describe('HistoryMap', () => {
  beforeEach(() => {
    vi.mocked(loadNaverMaps).mockResolvedValue(naverMock.maps as unknown as typeof naver.maps);
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('지도 생성 후 인증 실패하면 이력 지도 오류를 표시한다', async () => {
    const { getByText } = render(<HistoryMap selectedEntry={selectedEntry} />);
    await waitFor(() => expect(naverMock.maps.Map).toHaveBeenCalledOnce());
    act(() => vi.mocked(subscribeNaverMapsAuthFailure).mock.calls[0][0](new Error('네이버 지도 인증 실패')));
    expect(getByText('이력 지도를 초기화하지 못했습니다. 네이버 지도 인증 실패')).toBeInTheDocument();
    expect(naverMock.maps.Map.mock.results[0].value.destroy).toHaveBeenCalledOnce();
  });

  it('선택한 작업 이력을 네이버 위성 지도에 경로와 이벤트로 표시한다', async () => {
    render(<HistoryMap selectedEntry={selectedEntry} />);

    await waitFor(() => expect(naverMock.maps.Map).toHaveBeenCalledTimes(1));
    expect(naverMock.maps.Polyline).toHaveBeenCalledTimes(1);
    expect(naverMock.maps.Marker).toHaveBeenCalledTimes(1);
  });

  it('단일 위치는 선 대신 마커로 표시한다', async () => {
    render(<HistoryMap selectedEntry={{ ...selectedEntry, events: [], distanceMeters: null,
      route: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [127.454, 36.626] } },
    }} />);
    await waitFor(() => expect(naverMock.maps.Marker).toHaveBeenCalledTimes(1));
    expect(naverMock.maps.Polyline).not.toHaveBeenCalled();
  });
});


it('끊긴 두 구간을 별도 선으로 그리고 위치 없는 작업도 처리한다', async () => {
  vi.clearAllMocks();
  vi.mocked(loadNaverMaps).mockResolvedValue(naverMock.maps as unknown as typeof naver.maps);
  const { rerender, getByText } = render(<HistoryMap selectedEntry={{ ...selectedEntry, route: null, events: [],
    recordType: 'run', hasGpsGap: true, routeSegments: [
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[127, 37], [127.001, 37]] } },
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[128, 37], [128.001, 37]] } },
    ],
  }} />);
  await waitFor(() => expect(naverMock.maps.Polyline).toHaveBeenCalledTimes(2));
  expect(naverMock.maps.Polyline.mock.calls.map((c) => (c as unknown as [{path: unknown[]}])[0].path.length)).toEqual([2, 2]);
  rerender(<HistoryMap selectedEntry={{ ...selectedEntry, route: null, routeSegments: [], recordType: 'run' }} />);
  expect(getByText('저장된 GPS 위치가 없습니다.')).toBeInTheDocument();
  cleanup();
});
