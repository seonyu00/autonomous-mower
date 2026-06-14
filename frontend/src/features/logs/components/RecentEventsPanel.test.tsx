import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetStores } from '../../../test/testStores';
import { RecentEventsPanel } from './RecentEventsPanel';

describe('RecentEventsPanel', () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(cleanup);

  it('선택한 장비의 최근 이벤트만 compact 목록으로 표시한다', () => {
    render(<RecentEventsPanel />);

    expect(screen.getByRole('heading', { name: '최근 경고 및 이벤트' })).toBeInTheDocument();
    expect(screen.getByText('obstacle-detected')).toBeInTheDocument();
    expect(screen.getByText('sensor-fault')).toBeInTheDocument();
    expect(screen.queryByText('communication-lost')).not.toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(screen.getByRole('link', { name: '전체 보기' })).toHaveAttribute('href', '/logs');
  });
});
