import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadNaverMaps } from '../../map/naverMapsLoader';
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

  it('선택한 작업 이력을 네이버 위성 지도에 경로와 이벤트로 표시한다', async () => {
    render(<HistoryMap selectedEntry={selectedEntry} />);

    await waitFor(() => expect(naverMock.maps.Map).toHaveBeenCalledTimes(1));
    expect(naverMock.maps.Polyline).toHaveBeenCalledTimes(1);
    expect(naverMock.maps.Marker).toHaveBeenCalledTimes(1);
  });
});
