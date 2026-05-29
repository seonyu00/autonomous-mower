import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeadmanSwitch } from './DeadmanSwitch';

describe('DeadmanSwitch', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires the timeout callback after 500ms without new input', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const deadman = new DeadmanSwitch({
      timeoutMs: 500,
      onTimeout,
    });

    deadman.reset();
    vi.advanceTimersByTime(499);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('resets the 500ms timer when new input arrives', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const deadman = new DeadmanSwitch({
      timeoutMs: 500,
      onTimeout,
    });

    deadman.reset();
    vi.advanceTimersByTime(300);
    deadman.reset();
    vi.advanceTimersByTime(300);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does not fire after the switch is cleared', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const deadman = new DeadmanSwitch({
      timeoutMs: 500,
      onTimeout,
    });

    deadman.reset();
    deadman.clear();
    vi.advanceTimersByTime(500);

    expect(onTimeout).not.toHaveBeenCalled();
  });
});
