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
    LatLngBounds: vi.fn(),
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
