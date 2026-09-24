import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStores, TEST_ROBOT_ID } from '../../../test/testStores';
import { useRobotStore } from '../../robots/robotStore';
import { useTelemetryStore } from '../../telemetry/telemetryStore';
import { DEFAULT_MAP_CENTER } from '../mapDefaults';
import { useZoneStore } from '../zoneStore';
import { httpClient } from '../../../shared/api/httpClient';
import { MapViewMap } from './MapViewMap';

const envMock = vi.hoisted(() => ({
  naverMapClientId: '',
  enableMockWorkZone: true,
}));
const naverMapMock = vi.hoisted(() => ({
  failMessage: '지도를 초기화하지 못했습니다. WebGL 초기화 실패',
  props: null as Record<string, unknown> | null,
}));

vi.mock('../../../shared/config/env', () => ({
  env: envMock,
}));

vi.mock('./NaverOperationalMap', () => ({
  NaverOperationalMap: (props: Record<string, unknown>) => {
    naverMapMock.props = props;
    const onError = props.onError as (message: string) => void;
    const clientId = props.clientId as string;
    const onReadyChange = props.onReadyChange as (ready: boolean) => void;

    useEffect(() => {
      onReadyChange(false);
      if (!clientId) {
        onError('지도를 초기화하지 못했습니다. 네이버 지도 Client ID가 설정되지 않았습니다.');
      } else if (naverMapMock.failMessage) {
        onError(naverMapMock.failMessage);
      } else onReadyChange(true);
      return () => onReadyChange(false);
    }, [clientId, onError, onReadyChange]);

    return <div aria-label="네이버 위성 작업 지도" />;
  },
}));

describe('MapViewMap', () => {
  beforeEach(() => {
    envMock.naverMapClientId = '';
    envMock.enableMockWorkZone = true;
    naverMapMock.failMessage = '지도를 초기화하지 못했습니다. WebGL 초기화 실패';
    naverMapMock.props = null;
    resetStores();
    useRobotStore.setState({
      robots: [
        {
          id: 'MOWER-01',
          modelName: 'Jetson Orin Local Integration Mock',
          connectionState: 'offline',
          active: true,
        },
      ],
      selectedRobotId: 'MOWER-01',
    });
  });

  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('실제 모드 대체 지도에 CPP 선과 시작·끝을 표시하고 구역 변경 시 제거한다', async () => {
    envMock.enableMockWorkZone = false;
    useZoneStore.getState().setZone('MOWER-01', { type: 'Polygon', coordinates: [[[127, 37], [127.001, 37], [127, 37.001], [127, 37]]] }, 2);
    vi.spyOn(httpClient, 'post').mockResolvedValue({ robotId: 'MOWER-01', version: 2,
      path: [{ lon: 127.0001, lat: 37.0001 }, { lon: 127.0002, lat: 37.0002 }] });
    render(<MapViewMap />);
    fireEvent.click(screen.getByRole('button', { name: '예정 경로 생성' }));
    expect(await screen.findByLabelText('예정 경로 시작 1')).toBeInTheDocument();
    expect(screen.getByLabelText('예정 경로 끝 2')).toBeInTheDocument();
    expect(screen.getByLabelText('CPP 예정 경로 좌표 도식').querySelector('polyline')).toHaveAttribute('points');
    expect(naverMapMock.props?.previewRoute).toEqual([[127.0001, 37.0001], [127.0002, 37.0002]]);
    act(() => useZoneStore.getState().setZone('MOWER-01', null, 3));
    expect(screen.queryByLabelText('예정 경로 시작 1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '예정 경로 생성' })).toBeDisabled();
  });

  it('네이버 지도 초기화 실패 시 경고와 관제용 fallback layer를 표시한다', async () => {
    envMock.naverMapClientId = 'test-client-id';
    render(<MapViewMap />);

    expect(await screen.findByRole('alert')).toHaveTextContent('지도를 초기화하지 못했습니다.');
    expect(screen.getByRole('alert')).toHaveTextContent('Fallback 지도 표시 중');
    expect(screen.getByLabelText('지도 대체 운용 화면')).toBeInTheDocument();
    expect(screen.getByLabelText('대체 작업 구역')).toBeInTheDocument();
    expect(screen.getByLabelText('대체 샘플 경로')).toBeInTheDocument();
    expect(screen.getByLabelText('대체 로봇 위치')).toHaveTextContent('MOWER-01');
  });

  it('네이버 지도 초기화 실패 원인을 fallback 경고에 함께 표시한다', async () => {
    envMock.naverMapClientId = 'test-client-id';
    naverMapMock.failMessage = '지도를 초기화하지 못했습니다. SDK 인증 실패';
    render(<MapViewMap />);

    expect(await screen.findByRole('alert')).toHaveTextContent('SDK 인증 실패');
  });

  it('네이버 지도 Client ID가 없으면 fallback layer를 표시한다', async () => {
    render(<MapViewMap />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '네이버 지도 Client ID가 설정되지 않았습니다.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Fallback 지도 표시 중');
    expect(screen.getByLabelText('지도 대체 운용 화면')).toBeInTheDocument();
  });

  it('네이버 지도 런타임 오류가 발생하면 fallback layer로 전환한다', async () => {
    envMock.naverMapClientId = 'test-client-id';
    naverMapMock.failMessage = '';
    render(<MapViewMap />);

    act(() => {
      (naverMapMock.props?.onError as (message: string) => void)(
        '네이버 위성 지도를 불러오지 못했습니다.',
      );
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '네이버 위성 지도를 불러오지 못했습니다.',
    );
    expect(screen.getByLabelText('지도 대체 운용 화면')).toBeInTheDocument();
  });

  it('선택 장비의 관제 데이터를 네이버 지도 어댑터에 전달한다', () => {
    envMock.naverMapClientId = 'test-client-id';
    naverMapMock.failMessage = '';
    render(<MapViewMap />);

    expect(naverMapMock.props).toMatchObject({
      clientId: 'test-client-id',
      robotId: 'MOWER-01',
      livePositionAvailable: false,
    });
  });

  it('좌표가 0,0이면 유효 위치 대신 수신 대기 상태를 표시한다', async () => {
    const telemetry = useTelemetryStore.getState().telemetryByRobotId[TEST_ROBOT_ID];
    useTelemetryStore.setState({
      telemetryByRobotId: {
        ...useTelemetryStore.getState().telemetryByRobotId,
        [TEST_ROBOT_ID]: {
          ...telemetry,
          latitude: 0,
          longitude: 0,
        },
      },
    });

    render(<MapViewMap />);

    expect(await screen.findByText('위치 수신 대기')).toBeInTheDocument();
    expect(screen.getByText('GPS 미수신')).toBeInTheDocument();
    expect(screen.getByText('샘플 운용 데이터')).toBeInTheDocument();
    expect(screen.getByText('샘플 완료 경로')).toBeInTheDocument();
    expect(screen.getByText('샘플 예정 경로')).toBeInTheDocument();
    expect(screen.getByText(/샘플 방향/)).toBeInTheDocument();
    expect(screen.queryByText('0.00000, 0.00000')).not.toBeInTheDocument();
  });

  it('실제 좌표가 연속 수신되면 세션 경로 기준 방향을 표시한다', async () => {
    useTelemetryStore.setState({ dataSource: 'real', connectionState: 'connected' });
    render(<MapViewMap />);

    const telemetry = useTelemetryStore.getState().telemetryByRobotId[TEST_ROBOT_ID];
    act(() => {
      useTelemetryStore.getState().upsertTelemetry({
        ...telemetry,
        latitude: telemetry.latitude + 0.0001,
        lastReceivedAt: new Date().toISOString(),
      });
    });

    expect(await screen.findByText('GPS 위치')).toBeInTheDocument();
    expect(screen.getByText(/GPS 방향/)).toBeInTheDocument();
    expect(screen.getByText('세션 완료 경로')).toBeInTheDocument();
  });

  it('Mock 연결의 유효 좌표는 실제 GPS가 아니라 샘플 데이터로 표시한다', async () => {
    render(<MapViewMap />);

    expect(await screen.findByText('샘플 운용 데이터')).toBeInTheDocument();
    expect(screen.getByText('샘플 위치')).toBeInTheDocument();
    expect(screen.queryByText('GPS 위치')).not.toBeInTheDocument();
  });

  it('fallback 지도 편집 중 클릭한 위치를 작업 구역 꼭짓점으로 추가한다', async () => {
    useZoneStore.getState().startEditing('MOWER-01');
    render(<MapViewMap />);

    const editingMap = await screen.findByLabelText('작업 구역 편집 지도');
    vi.spyOn(editingMap, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 50,
      width: 1000,
      height: 620,
      right: 1100,
      bottom: 670,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    });

    fireEvent.click(editingMap, {
      clientX: 600,
      clientY: 360,
    });

    expect(useZoneStore.getState().draftVerticesByRobotId['MOWER-01']).toEqual([
      DEFAULT_MAP_CENTER,
    ]);
    expect(screen.getByText('개발용 샘플 좌표 편집 · 실제 DB 저장 안 함')).toBeInTheDocument();
  });

  it('실제 대체 지도는 저장 좌표 도식을 표시하고 클릭·드래그를 차단한다', () => {
    envMock.enableMockWorkZone = false;
    // 텔레메트리 Mock 여부가 작업 구역의 실제 저장 정책을 바꾸지 않는다.
    useZoneStore.getState().setZone('MOWER-01', { type: 'Polygon', coordinates: [[
      [129, 35], [129.01, 35], [129.01, 35.01], [129, 35],
    ]] }, 3);
    useZoneStore.getState().startEditing('MOWER-01', [[128, 36], [128.1, 36], [128.1, 36.1]]);
    const { container } = render(<MapViewMap />);
    expect(screen.getByText('저장 구역 좌표 도식 · 실제 배경 지도 아님 · 편집 및 저장 불가')).toBeInTheDocument();
    expect(container.querySelector('.fallback-work-zone')).toBeInTheDocument();
    expect(screen.getByLabelText('대체 작업 구역')).toHaveTextContent('저장된 작업 구역');
    expect(screen.queryByLabelText('작업 구역 편집 지도')).not.toBeInTheDocument();
    const svg = container.querySelector('.map-fallback-layer svg')!;
    fireEvent.click(svg, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 500, clientY: 300 });
    expect(useZoneStore.getState().draftVerticesByRobotId['MOWER-01']).toEqual([[128, 36], [128.1, 36], [128.1, 36.1]]);
  });

  it('정상 지도 편집은 유지하고 런타임 실패 뒤 늦은 지도 이벤트는 차단한다', () => {
    envMock.enableMockWorkZone = false;
    envMock.naverMapClientId = 'test';
    naverMapMock.failMessage = '';
    useZoneStore.getState().startEditing('MOWER-01');
    render(<MapViewMap />);
    const add = naverMapMock.props?.onAddVertex as (position: [number, number]) => void;
    act(() => add([129, 35]));
    expect(useZoneStore.getState().draftVerticesByRobotId['MOWER-01']).toEqual([[129, 35]]);
    act(() => (naverMapMock.props?.onError as (message: string) => void)('runtime failure'));
    act(() => add([127, 37]));
    expect(useZoneStore.getState().mapReady).toBe(false);
    expect(useZoneStore.getState().draftVerticesByRobotId['MOWER-01']).toEqual([[129, 35]]);
  });

  it('실제 모드의 미수신 상태에서는 샘플 경로와 대체 로봇 위치를 표시하지 않는다', () => {
    useTelemetryStore.setState({ dataSource: 'real', telemetryByRobotId: {}, connectionState: 'disconnected' });
    render(<MapViewMap />);
    expect(screen.queryByText('샘플 운용 데이터')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('대체 샘플 경로')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('대체 로봇 위치')).not.toBeInTheDocument();
    expect(naverMapMock.props?.plannedRoute).toEqual([]);
    expect(naverMapMock.props?.completedRoute).toEqual([]);
    expect(naverMapMock.props?.markerPosition).toBeUndefined();
  });

  it('연결 상태가 바뀌어도 샘플 데이터 출처는 유지된다', () => {
    useTelemetryStore.getState().setConnectionState('connected');
    render(<MapViewMap />);
    expect(screen.getByText('샘플 운용 데이터')).toBeInTheDocument();
    expect(screen.queryByText('GPS 위치')).not.toBeInTheDocument();
  });

  it('fallback 지도에서 꼭짓점을 드래그하면 해당 좌표만 이동한다', async () => {
    useZoneStore.getState().startEditing('MOWER-01', [
      [127.455, 36.629],
      [127.456, 36.629],
      [127.456, 36.628],
    ]);
    render(<MapViewMap />);

    const editingMap = await screen.findByLabelText('작업 구역 편집 지도');
    vi.spyOn(editingMap, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 50,
      width: 1000,
      height: 620,
      right: 1100,
      bottom: 670,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    });

    const vertex = screen.getByLabelText('작업 구역 꼭짓점 1');
    fireEvent.pointerDown(vertex, { pointerId: 1 });
    fireEvent.pointerMove(editingMap, {
      pointerId: 1,
      clientX: 600,
      clientY: 360,
    });
    fireEvent.pointerUp(editingMap, { pointerId: 1 });

    expect(useZoneStore.getState().draftVerticesByRobotId['MOWER-01'][0]).toEqual(
      DEFAULT_MAP_CENTER,
    );
    expect(useZoneStore.getState().draftVerticesByRobotId['MOWER-01']).toHaveLength(3);
  });
});
