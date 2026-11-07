import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CppPreviewControls } from './CppPreviewControls';

afterEach(cleanup);

it('HD-7000W 예초 폭에 맞는 기본 격자와 입력 제한을 적용한다', () => {
  const generate = vi.fn();
  render(<CppPreviewControls preview={{ available: true, loading: false, path: [], message: '', planId: null, sha256: null, preparation: { message: '', loading: false }, checkPreparation: vi.fn(), generate }} />);
  fireEvent.click(screen.getByText('CPP 예정 경로 · 검토용 미리보기'));
  const input = screen.getByRole('spinbutton', { name: '격자 간격(m)' });
  const button = screen.getByRole('button', { name: '예정 경로 생성' });
  expect(input).toHaveValue(0.2);
  expect(input).toHaveAttribute('max', '0.65');
  fireEvent.click(button);
  expect(generate).toHaveBeenLastCalledWith(0.2);
  fireEvent.change(input, { target: { value: '1' } });
  expect(button).toBeDisabled();
  fireEvent.change(input, { target: { value: '0.65' } });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  expect(generate).toHaveBeenLastCalledWith(0.65);
  expect(screen.getByText(/예초 폭 650mm/)).toBeVisible();
});
