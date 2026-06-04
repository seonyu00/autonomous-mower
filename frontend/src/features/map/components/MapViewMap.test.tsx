import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRobotStore } from '../../robots/robotStore';
import { MapViewMap } from './MapViewMap';

vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn(() => {
      throw new Error('WebGL 초기화 실패');
    }),
    NavigationControl: vi.fn(),
    AttributionControl: vi.fn(),
  },
}));

describe('MapViewMap', () => {
  beforeEach(() => {
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

  it('MapLibre 초기화 실패가 앱 전체 렌더링을 중단하지 않도록 패널 내부 오류를 표시한다', async () => {
    render(<MapViewMap />);

    expect(await screen.findByText('지도를 초기화하지 못했습니다.')).toBeInTheDocument();
  });
});
