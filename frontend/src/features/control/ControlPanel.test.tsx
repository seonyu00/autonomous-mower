import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '../../app/providers/AuthProvider';
import { resetStores } from '../../test/testStores';
import { ControlPanel } from './ControlPanel';

describe('ControlPanel compact dock', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(cleanup);

  it('기본 화면에는 사용자용 제어 상태와 한글 경고만 표시한다', () => {
    render(
      <AuthProvider>
        <ControlPanel compact />
      </AuthProvider>,
    );

    expect(screen.getByText('제어권 없음')).toBeInTheDocument();
    expect(screen.getAllByText('제어권을 먼저 획득하세요').length).toBeGreaterThan(0);
    expect(screen.getByText('control-lock-not-held')).not.toBeVisible();
    expect(screen.getByText('requesting')).not.toBeVisible();
    expect(screen.getByText('held-by-other')).not.toBeVisible();
  });

  it('원시 상태와 precheck code는 개발 상세 패널 안에 보존한다', () => {
    render(
      <AuthProvider>
        <ControlPanel compact />
      </AuthProvider>,
    );

    const debugDetails = screen.getByText('개발/디버그 상세').closest('details');

    expect(debugDetails).not.toBeNull();
    expect(debugDetails).not.toHaveAttribute('open');
    expect(debugDetails).toHaveTextContent('control-lock-not-held');
    expect(debugDetails).toHaveTextContent('requesting');
    expect(debugDetails).toHaveTextContent('held-by-other');
  });

  it('공통 제한 안내를 각 제어 그룹의 접근성 설명으로 연결한다', () => {
    render(
      <AuthProvider>
        <ControlPanel compact />
      </AuthProvider>,
    );

    expect(screen.getByLabelText('모드 선택 제어')).toHaveAccessibleDescription('제어권을 먼저 획득하세요');
    expect(screen.getByLabelText('작업 제어')).toHaveAccessibleDescription('제어권을 먼저 획득하세요');
    expect(screen.getByLabelText('예초 장치 제어')).toHaveAccessibleDescription('제어권을 먼저 획득하세요');
    expect(within(screen.getByLabelText('모드 및 예초 장치 명령')).getAllByText('제어권을 먼저 획득하세요')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'AUTO' })).toBeDisabled();
    expect(within(screen.getByLabelText('수동 조이스틱 제어')).getByText('제어권을 먼저 획득하세요')).toBeInTheDocument();
  });
});
