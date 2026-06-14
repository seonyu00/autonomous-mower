import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapViewPage } from './MapViewPage';

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

vi.mock('../features/map/components/MapViewMap', () => ({
  MapViewMap: () => <div>지도 컴포넌트</div>,
}));

vi.mock('../features/map/components/WorkZoneEditor', () => ({
  WorkZoneEditor: () => <div>작업 구역 편집기</div>,
}));

vi.mock('../features/control/ControlPanel', () => ({
  ControlPanel: ({ compact }: { compact?: boolean }) => <div>{compact ? 'compact 제어 패널' : '제어 패널'}</div>,
}));

vi.mock('../features/control/EmergencyStopButton', () => ({
  EmergencyStopButton: () => <button type="button">E-STOP</button>,
}));

afterEach(cleanup);

describe('MapViewPage', () => {
  it('지도와 하단 제어를 분리한 관제 그리드로 렌더링한다', () => {
    render(<MapViewPage />);

    expect(screen.getByRole('region', { name: '실시간 작업 지도' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '하단 운용 제어' })).toBeInTheDocument();
    expect(screen.getByText('compact 제어 패널')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'E-STOP' })).toBeInTheDocument();
  });

  it('작업 구역 편집기는 지도 내부의 접이식 패널로 시작한다', () => {
    render(<MapViewPage />);

    const editor = screen.getByText('작업 구역 설정').closest('details');

    expect(editor).not.toBeNull();
    expect(editor).not.toHaveAttribute('open');
    expect(screen.getByText('작업 구역 편집기')).toBeInTheDocument();
  });

  it('하단 제어 dock은 안전 정보가 잘리지 않는 224px 높이를 사용한다', () => {
    expect(styles).toMatch(/grid-template-rows:\s*minmax\(0,\s*1fr\)\s+224px/);
    expect(styles).toMatch(/\.map-console-controls\s*\{[^}]*height:\s*224px[^}]*max-height:\s*224px/s);
  });
});
