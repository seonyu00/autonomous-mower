import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadNaverMaps, subscribeNaverMapsAuthFailure } from '../../map/naverMapsLoader';
import type { MissionReplay, ReplayFrame } from '../missionReplay';
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
      return { setMap: vi.fn(), setPath: vi.fn(), setVisible: vi.fn() };
    }),
    Marker: vi.fn(function MockMarker() {
      return { setMap: vi.fn(), setPosition: vi.fn(), setVisible: vi.fn() };
    }),
    Polygon: vi.fn(function MockPolygon() {
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

const replayFrame: ReplayFrame = {
  time: 1000, revision: 1, path: [[0, 0], [10, -10]], pose: [5, -5], target: [10, -10],
  reason: '', fresh: true, complete: false,
  objects: [{ id: 'person-1', label: 'person', visible: true, position: [4, -5],
    region: [[3, -4], [5, -4], [5, -6]], safety: [[2, -3], [6, -3], [6, -7]] }],
};
const replay: MissionReplay = {
  zoneId: '2', version: 11, anchor: { lon: 127, lat: 37 }, boundary: [[0, 0], [20, 0], [20, -20]],
  frames: [replayFrame], changes: [],
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

  it('재생 프레임을 위성 지도에 겹치고 다음 프레임에서 누락된 지도 표시를 숨긴다', async () => {
    const { rerender } = render(<HistoryMap selectedEntry={null} replay={replay} frame={replayFrame} />);
    await waitFor(() => expect(naverMock.maps.Polygon).toHaveBeenCalledTimes(3));
    expect(naverMock.maps.Polygon).toHaveBeenCalledWith(expect.objectContaining({ strokeStyle: 'shortdash' }));
    const map = naverMock.maps.Map.mock.results[0].value;
    const path = naverMock.maps.Polyline.mock.results[0].value;
    const pose = naverMock.maps.Marker.mock.results[0].value;
    const target = naverMock.maps.Marker.mock.results[1].value;
    expect(map.fitBounds).toHaveBeenCalledOnce();
    expect(path.setPath).toHaveBeenCalledWith([expect.anything(), expect.anything()]);
    const coord = (pose.setPosition.mock.lastCall as unknown as [{lat: () => number; lng: () => number}])[0];
    expect(coord.lat()).toBeCloseTo(37.000045, 6);
    expect(coord.lng()).toBeCloseTo(127.000056, 6);
    expect(target.setVisible).toHaveBeenLastCalledWith(true);

    rerender(<HistoryMap selectedEntry={null} replay={replay}
      frame={{ ...replayFrame, path: [], pose: null, target: null, objects: [] }} />);
    expect(map.fitBounds).toHaveBeenCalledOnce();
    expect(path.setVisible).toHaveBeenLastCalledWith(false);
    expect(pose.setVisible).toHaveBeenLastCalledWith(false);
    expect(target.setVisible).toHaveBeenLastCalledWith(false);
    expect(naverMock.maps.Polygon.mock.results[1].value.setMap).toHaveBeenCalledWith(null);

    rerender(<HistoryMap selectedEntry={null} />);
    expect(path.setMap).toHaveBeenCalledWith(null);
    expect(naverMock.maps.Map).toHaveBeenCalledOnce();
  });

  it('배경 지도 초기화에 실패해도 같은 패널에 재생 도식을 표시한다', async () => {
    vi.mocked(loadNaverMaps).mockRejectedValueOnce(new Error('네이버 지도 준비 오류'));
    const { findByRole } = render(<HistoryMap selectedEntry={null} replay={replay} frame={replayFrame} />);
    expect(await findByRole('alert')).toHaveTextContent('네이버 지도 준비 오류');
    expect(await findByRole('img', { name: '작업 구역과 기록 시점의 경로·장애물 지도' })).toBeInTheDocument();
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
