import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetStores, TEST_ROBOT_ID } from '../../test/testStores';
import { useAuthStore } from '../auth/authStore';
import { useControlStore } from './controlStore';
import { EmergencyStopButton, EmergencyStopStatus } from './EmergencyStopButton';

describe('EmergencyStopStatus', () => {
  beforeEach(() => {
    resetStores();
  });

  it('헤더에서는 긴급 정지 상태만 compact indicator로 표시한다', () => {
    render(<EmergencyStopStatus />);

    expect(screen.getByText('E-STOP 준비')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('긴급 정지 활성 상태를 경고 indicator로 표시한다', () => {
    useControlStore.getState().patchControlState(TEST_ROBOT_ID, {
      emergency: true,
      mode: 'emergency',
    });

    render(<EmergencyStopStatus />);

    expect(screen.getByText('E-STOP 활성')).toBeInTheDocument();
  });

  it('긴급 정지 버튼이 비활성일 때 사용자용 사유를 표시한다', () => {
    useAuthStore.setState({ user: null, accessToken: null, isAuthenticated: false });

    render(<EmergencyStopButton />);

    expect(screen.getByRole('button', { name: 'MOWER-01 긴급 정지' })).toBeDisabled();
    expect(screen.getByText('작업자 세션이 없습니다.')).toBeInTheDocument();
  });

  it('긴급 정지의 안전 실행 조건을 compact 정보로 표시한다', () => {
    render(<EmergencyStopButton />);

    const safetyInfo = screen.getByLabelText('긴급 정지 안전 정보');

    expect(within(safetyInfo).getByText('작동 이력')).toBeInTheDocument();
    expect(within(safetyInfo).getByText('없음')).toBeInTheDocument();
    expect(within(safetyInfo).getByText('확인 후 실행')).toBeInTheDocument();
    expect(within(safetyInfo).getByText('제어권 불필요')).toBeInTheDocument();
  });
});

afterEach(cleanup);
