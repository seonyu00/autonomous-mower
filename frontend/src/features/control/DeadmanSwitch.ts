export type DeadmanSwitchConfig = {
  timeoutMs: number;
  onTimeout: () => void;
};

export class DeadmanSwitch {
  private timerId: number | undefined;

  constructor(private readonly config: DeadmanSwitchConfig) {}

  reset() {
    this.clear();
    this.timerId = window.setTimeout(this.config.onTimeout, this.config.timeoutMs);
  }

  clear() {
    if (this.timerId !== undefined) {
      window.clearTimeout(this.timerId);
      this.timerId = undefined;
    }
  }
}
