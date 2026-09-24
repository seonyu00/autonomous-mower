import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MAP_CENTER } from '../mapDefaults';
import { loadNaverMaps } from '../naverMapsLoader';
import { NaverOperationalMap } from './NaverOperationalMap';

const naverMock = vi.hoisted(() => {
  const listeners: Array<{
    target: unknown;
    eventName: string;
    handler: (event: unknown) => void;
  }> = [];
  const maps = {
    MapTypeId: { SATELLITE: 'satellite' },
    Position: { TOP_RIGHT: 3 },
    LatLng: vi.fn(function MockLatLng(lat: number, lng: number) {
      return {
        lat: () => lat,
        lng: () => lng,
      };
    }),
    Map: vi.fn(function MockMap(_container: HTMLElement, options: Record<string, unknown>) {
      return {
        options,
        panTo: vi.fn(),
        fitBounds: vi.fn(),
        destroy: vi.fn(),
      };
    }),
    Polygon: vi.fn(function MockPolygon(options: Record<string, unknown>) {
      return {
        options,
        setPaths: vi.fn(),
        setMap: vi.fn(),
      };
    }),
    Polyline: vi.fn(function MockPolyline(options: Record<string, unknown>) {
      return {
        options,
        setPath: vi.fn(),
        setMap: vi.fn(),
      };
    }),
    Marker: vi.fn(function MockMarker(options: Record<string, unknown>) {
      let position = options.position;
      return {
        options,
        getPosition: vi.fn(() => position),
        setPosition: vi.fn((nextPosition: unknown) => {
          position = nextPosition;
        }),
        setIcon: vi.fn(),
        setMap: vi.fn(),
      };
    }),
    LatLngBounds: vi.fn(function () { return { extend: vi.fn() }; }),
    Event: {
      addListener: vi.fn((target: unknown, eventName: string, handler: (event: unknown) => void) => {
        const listener = { target, eventName, handler };
        listeners.push(listener);
        return listener;
      }),
      removeListener: vi.fn(),
    },
  };

  return { listeners, maps };
});

vi.mock('../naverMapsLoader', () => ({
  loadNaverMaps: vi.fn(),
}));

describe('NaverOperationalMap', () => {
  beforeEach(() => {
    vi.mocked(loadNaverMaps).mockResolvedValue(naverMock.maps as unknown as typeof naver.maps);
    naverMock.listeners.length = 0;
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('네이버 위성 지도와 관제 오버레이를 생성한다', async () => {
    const { getByLabelText } = render(
      <NaverOperationalMap
        clientId="test-client"
        robotId="MOWER-01"
        robotMode="auto"
        livePositionAvailable={false}
        markerPosition={DEFAULT_MAP_CENTER}
        headingDegrees={55}
        workZone={{
          type: 'Polygon',
          coordinates: [[
            [127.454, 36.626],
            [127.455, 36.626],
            [127.455, 36.625],
            [127.454, 36.626],
          ]],
        }}
        draftVertices={[]}
        plannedRoute={[[127.454, 36.626], [127.455, 36.625]]}
        completedRoute={[[127.453, 36.626], [127.454, 36.626]]}
        editing={false}
        onAddVertex={vi.fn()}
        onMoveVertex={vi.fn()}
        onError={vi.fn()}
      />,
    );

    expect(getByLabelText('네이버 위성 작업 지도')).toHaveStyle({
      width: '100%',
      height: '100%',
    });
    await waitFor(() => expect(naverMock.maps.Map).toHaveBeenCalledTimes(1));
    expect(naverMock.maps.Map).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        zoom: 18,
        maxZoom: 19,
        mapTypeId: 'satellite',
      }),
    );
    expect(naverMock.maps.Polygon).toHaveBeenCalledTimes(1);
    expect(naverMock.maps.Polyline).toHaveBeenCalledTimes(2);
    expect(naverMock.maps.Marker).toHaveBeenCalledTimes(1);
  });

  it('편집 중 지도 클릭과 꼭짓점 드래그를 좌표 변경으로 전달한다', async () => {
    const onAddVertex = vi.fn();
    const onMoveVertex = vi.fn();

    render(
      <NaverOperationalMap
        clientId="test-client"
        robotId="MOWER-01"
        robotMode="manual"
        livePositionAvailable={false}
        markerPosition={DEFAULT_MAP_CENTER}
        headingDegrees={null}
        workZone={null}
        draftVertices={[[127.454, 36.626]]}
        plannedRoute={[]}
        completedRoute={[]}
        editing
        onAddVertex={onAddVertex}
        onMoveVertex={onMoveVertex}
        onError={vi.fn()}
      />,
    );

    await waitFor(() => expect(naverMock.maps.Marker).toHaveBeenCalledTimes(2));

    const mapListener = naverMock.listeners.find((listener) => listener.eventName === 'click');
    mapListener?.handler({
      coord: {
        lat: () => 36.6259,
        lng: () => 127.4545,
      },
    });
    expect(onAddVertex).toHaveBeenCalledWith([127.4545, 36.6259]);

    const dragListener = naverMock.listeners.find((listener) => listener.eventName === 'dragend');
    dragListener?.handler({
      coord: {
        lat: () => 36.6258,
        lng: () => 127.4544,
      },
    });
    expect(onMoveVertex).toHaveBeenCalledWith(0, [127.4544, 36.6258]);
  });
});

it('CPP 모든 경로점과 시작·끝·방향 표식을 표시하고 변경 시 제거한다', async () => {
  vi.mocked(loadNaverMaps).mockResolvedValue(naverMock.maps as unknown as typeof naver.maps);
  vi.clearAllMocks();
  const props = { clientId: 'test', robotId: 'R1', livePositionAvailable: false,
    headingDegrees: null, workZone: null, draftVertices: [], plannedRoute: [], completedRoute: [],
    editing: false, onAddVertex: vi.fn(), onMoveVertex: vi.fn(), onError: vi.fn() };
  const { rerender, unmount } = render(<NaverOperationalMap {...props}
    previewRoute={[[127, 37], [127.0001, 37], [127.0001, 37.0001]]} />);
  await waitFor(() => expect(naverMock.maps.Marker).toHaveBeenCalledTimes(3));
  const line = naverMock.maps.Polyline.mock.results[0].value;
  expect(line.options.path.map((point: naver.maps.LatLng) => [point.lng(), point.lat()]))
    .toEqual([[127, 37], [127.0001, 37], [127.0001, 37.0001]]);
  const markers = naverMock.maps.Marker.mock.results.map((result) => result.value);
  expect(markers[0].options.title).toBe('예정 경로 시작 1');
  expect(markers[2].options.title).toBe('예정 경로 끝 3');
  expect((markers[0].options.icon as { content: HTMLElement }).content.querySelector('span')?.style.transform).toBe('rotate(90deg)');
  rerender(<NaverOperationalMap {...props} previewRoute={[]} />);
  expect(line.setMap).toHaveBeenCalledWith(null);
  markers.forEach((marker) => expect(marker.setMap).toHaveBeenCalledWith(null));
  unmount();
});

it('미리보기 중 위치 마커만 갱신하고 경로 제거 후 자동 추적을 재개한다', async () => {
  vi.mocked(loadNaverMaps).mockResolvedValue(naverMock.maps as unknown as typeof naver.maps);
  vi.clearAllMocks();
  const props = { clientId: 'test', robotId: 'R1', livePositionAvailable: true,
    headingDegrees: null, workZone: null, draftVertices: [], plannedRoute: [], completedRoute: [],
    editing: false, onAddVertex: vi.fn(), onMoveVertex: vi.fn(), onError: vi.fn() };
  const { rerender, unmount } = render(<NaverOperationalMap {...props} markerPosition={[128, 38]} />);
  await waitFor(() => expect(naverMock.maps.Map).toHaveBeenCalledTimes(1));
  const map = naverMock.maps.Map.mock.results[0].value;
  expect(map.panTo).toHaveBeenCalledTimes(1);
  map.panTo.mockClear();
  const route: [number, number][] = [[127, 37], [127.001, 37.001]];
  rerender(<NaverOperationalMap {...props} markerPosition={[128, 38]} previewRoute={route} />);
  expect(map.fitBounds).toHaveBeenCalledTimes(1);
  expect(map.panTo).not.toHaveBeenCalled();
  rerender(<NaverOperationalMap {...props} markerPosition={[128.1, 38.1]} previewRoute={route} />);
  expect(map.panTo).not.toHaveBeenCalled();
  const marker = naverMock.maps.Marker.mock.results.at(-1)!.value;
  const position = marker.options.position as naver.maps.LatLng;
  expect([position.lng(), position.lat()]).toEqual([128.1, 38.1]);
  rerender(<NaverOperationalMap {...props} markerPosition={[128.1, 38.1]} previewRoute={[]} />);
  expect(map.panTo).toHaveBeenCalledTimes(1);
  unmount();
});
