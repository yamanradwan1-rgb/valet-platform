export class TaskQueueTimer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly onTick: () => void;

  constructor(intervalMs: number, onTick: () => void) {
    this.intervalMs = intervalMs;
    this.onTick = onTick;
  }

  public start(): void {
    this.stop();
    this.timer = setInterval(this.onTick, this.intervalMs);
  }

  public stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
