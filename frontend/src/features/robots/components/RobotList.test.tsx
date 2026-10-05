import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetStores } from '../../../test/testStores';
import { useRobotStore } from '../robotStore';
import { RobotList } from './RobotList';

beforeEach(() => resetStores());
afterEach(cleanup);

describe('RobotList', () => {
  it('모바일 선택과 데스크톱 버튼이 동일한 선택 장비 상태를 갱신한다', () => {
    render(<RobotList />);
    const selector = screen.getByRole('combobox', { name: '선택 장비' });

    fireEvent.change(selector, { target: { value: 'MOWER-02' } });
    expect(useRobotStore.getState().selectedRobotId).toBe('MOWER-02');
    expect(screen.getByRole('button', { name: 'MOWER-02 Orin NX Model-A' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'MOWER-01 Orin NX Model-A' }));
    expect(selector).toHaveValue('MOWER-01');
  });
});
