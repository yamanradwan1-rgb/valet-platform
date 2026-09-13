import {
  createPhysicalEvidence,
  parsePhysicalSamples,
  type PhysicalEvidence,
  type PhysicalFailureClass,
  type PhysicalMetric,
  type PhysicalSample,
} from "./native-physical-diagnostics-model";

export interface PhysicalDiagnosticsPersistence {
  clear(): Promise<void>;
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

export class NativePhysicalDiagnosticsStore {
  private samples: PhysicalSample[] = [];
  private loaded = false;
  private loading: Promise<void> | undefined;
  private persistenceWork = Promise.resolve();
  private listeners = new Set<() => void>();

  constructor(private readonly persistence: PhysicalDiagnosticsPersistence) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  snapshot = (): readonly PhysicalSample[] => this.samples;

  async load(): Promise<void> {
    if (this.loaded) return;
    if (this.loading) return this.loading;
    this.loading = this.readPersisted();
    return this.loading;
  }

  private async readPersisted(): Promise<void> {
    try {
      const stored = await this.persistence.read();
      this.samples = [
        ...(stored ? parsePhysicalSamples(stored) : []),
        ...this.samples,
      ].slice(-200);
    } catch {
      // Persistence is development evidence only and must remain fail-open.
    }
    this.loaded = true;
    this.loading = undefined;
    this.emit();
  }

  record(input: {
    metric: PhysicalMetric;
    startedAt: number;
    endedAt?: number;
    outcome: "success" | "failure";
    warmColdClass: string;
    failureClass?: PhysicalFailureClass;
  }): void {
    const endedAt = input.endedAt ?? Date.now();
    const sample: PhysicalSample = {
      metric: input.metric,
      durationMs: Math.max(0, Math.round(endedAt - input.startedAt)),
      outcome: input.outcome,
      warmColdClass: input.warmColdClass.slice(0, 40),
      timestamp: new Date(endedAt).toISOString(),
      ...(input.failureClass ? { failureClass: input.failureClass } : {}),
    };
    this.samples = [...this.samples, sample].slice(-200);
    this.emit();
    if (this.loaded) this.persistCurrent();
    else void this.load().then(() => this.persistCurrent());
  }

  async whenIdle(): Promise<void> {
    await this.load();
    await this.persistenceWork;
  }

  async clear(): Promise<void> {
    await this.load();
    this.samples = [];
    this.emit();
    this.persistenceWork = this.persistenceWork
      .then(() => this.persistence.clear())
      .catch(() => undefined);
    await this.persistenceWork;
  }

  evidence(): PhysicalEvidence {
    return createPhysicalEvidence(this.samples);
  }

  private persistCurrent(): void {
    const value = JSON.stringify(this.samples);
    this.persistenceWork = this.persistenceWork
      .then(() => this.persistence.write(value))
      .catch(() => undefined);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
