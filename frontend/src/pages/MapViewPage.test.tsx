import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapViewPage } from './MapViewPage';

vi.mock('../features/map/components/MapViewMap', () => ({
  MapViewMap: () => <div>지도 컴포넌트</div>,
}));

vi.mock('../features/map/components/WorkZoneEditor', () => ({
  WorkZoneEditor: () => <div>작업 구역 편집기</div>,
}));

afterEach(cleanup);

describe('MapViewPage', () => {
  it('작업 지도와 편집 도구를 렌더링한다', () => {
    render(<MapViewPage />);

    expect(screen.getByRole('region', { name: '실시간 작업 지도' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '작업 지도' })).toBeInTheDocument();
  });

  it('작업 구역 편집기는 지도 내부의 접이식 패널로 시작한다', () => {
    render(<MapViewPage />);

    const editor = screen.getByText('작업 구역 설정').closest('details');

    expect(editor).not.toBeNull();
    expect(editor).not.toHaveAttribute('open');
    expect(screen.getByText('작업 구역 편집기')).toBeInTheDocument();
  });

  it('실제 연결에서도 샘플 정상 상태를 고정 표시하지 않는다', () => {
    render(<MapViewPage />);
    expect(screen.queryByText('1Hz 샘플 텔레메트리(Telemetry)')).not.toBeInTheDocument();
  });
});
