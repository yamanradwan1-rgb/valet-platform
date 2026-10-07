import {
  gpsIngestionRequestSchema,
  type GpsIngestionResponse,
} from "@valet/contracts";

import type { EmployeeGpsSample } from "./employee-gps-ingestion-transport";

export const employeeGpsResidentSampleCap = 50;
export const employeeGpsPendingLifetimeMs = 120_000;

export interface EmployeeGpsPhysicalFix {
  readonly accuracyMeters: number;
  readonly capturedAt: string;
  readonly latitude: number;
  readonly longitude: number;
}

interface ResidentSample {
  readonly admittedAt: number;
  readonly sample: EmployeeGpsSample;
  readonly sequence: number;
}

interface ActiveBatch {
  readonly samples: readonly EmployeeGpsSample[];
  readonly sampleIds: readonly string[];
}

export interface EmployeeGpsSampleBufferOptions {
  readonly createId: () => string;
  readonly capacity?: number | undefined;
  readonly pendingLifetimeMs?: number | undefined;
}

/** Transient task-GPS memory. This class has no persistence or background I/O. */
export class EmployeeGpsSampleBuffer {
  private active: ActiveBatch | undefined;
  private readonly capacity: number;
  private readonly createId: () => string;
  private readonly pendingLifetimeMs: number;
  private resident: ResidentSample[] = [];
  private retryIds: readonly string[] | undefined;
  private sequence = 0;

  constructor(options: EmployeeGpsSampleBufferOptions) {
    this.capacity = options.capacity ?? employeeGpsResidentSampleCap;
    this.createId = options.createId;
    this.pendingLifetimeMs =
      options.pendingLifetimeMs ?? employeeGpsPendingLifetimeMs;
  }

  admit(fix: EmployeeGpsPhysicalFix, now: number): EmployeeGpsSample | null {
    this.evictExpired(now);
    const parsed = gpsIngestionRequestSchema.safeParse({
      samples: [{ ...fix, clientSampleId: this.createId() }],
    });
    if (!parsed.success) return null;
    if (this.resident.length >= this.capacity && !this.evictOldestUnsent()) {
      return null;
    }
    const sample = Object.freeze({ ...parsed.data.samples[0]! });
    this.resident.push({
      admittedAt: now,
      sample,
      sequence: ++this.sequence,
    });
    return sample;
  }

  beginBatch(now: number): readonly EmployeeGpsSample[] | null {
    if (this.active !== undefined) return null;
    this.evictExpired(now);
    const retry = this.retryIds;
    const selected =
      retry === undefined
        ? this.resident
        : retry
            .map((id) => this.resident.find((entry) => entry.sample.clientSampleId === id))
            .filter((entry): entry is ResidentSample => entry !== undefined);
    if (selected.length === 0) {
      this.retryIds = undefined;
      return null;
    }
    const samples = Object.freeze(
      [...selected]
        .sort((a, b) => {
          const captureOrder =
            Date.parse(a.sample.capturedAt) - Date.parse(b.sample.capturedAt);
          return captureOrder === 0 ? a.sequence - b.sequence : captureOrder;
        })
        .map((entry) => entry.sample),
    );
    this.active = {
      sampleIds: Object.freeze(samples.map((sample) => sample.clientSampleId)),
      samples,
    };
    return samples;
  }

  acceptResponse(response: GpsIngestionResponse): boolean {
    const active = this.active;
    if (active === undefined) return false;
    const returned = response.samples.map((sample) => sample.clientSampleId);
    const coherent =
      returned.length === active.sampleIds.length &&
      new Set(returned).size === returned.length &&
      active.sampleIds.every((id) => returned.includes(id));
    if (!coherent) return false;
    const accepted = new Set(active.sampleIds);
    this.resident = this.resident.filter(
      (entry) => !accepted.has(entry.sample.clientSampleId),
    );
    this.active = undefined;
    this.retryIds = undefined;
    return true;
  }

  markUnknown(): void {
    if (this.active === undefined) return;
    this.retryIds = this.active.sampleIds;
    this.active = undefined;
  }

  clear(): void {
    this.active = undefined;
    this.resident = [];
    this.retryIds = undefined;
  }

  get residentCount(): number {
    return this.resident.length;
  }

  get inFlightCount(): number {
    return this.active?.samples.length ?? 0;
  }

  private evictExpired(now: number): void {
    if (this.retryIds !== undefined) {
      const retryEntries = this.retryIds
        .map((id) => this.resident.find((entry) => entry.sample.clientSampleId === id))
        .filter((entry): entry is ResidentSample => entry !== undefined);
      const retryExpired =
        retryEntries.length !== this.retryIds.length ||
        retryEntries.some(
          (entry) => now - entry.admittedAt >= this.pendingLifetimeMs,
        );
      if (retryExpired) {
        const retired = new Set(this.retryIds);
        this.resident = this.resident.filter(
          (entry) => !retired.has(entry.sample.clientSampleId),
        );
        this.retryIds = undefined;
      }
    }
    const protectedIds = new Set(this.active?.sampleIds ?? []);
    this.resident = this.resident.filter(
      (entry) =>
        protectedIds.has(entry.sample.clientSampleId) ||
        now - entry.admittedAt < this.pendingLifetimeMs,
    );
  }

  private evictOldestUnsent(): boolean {
    const protectedIds = new Set([
      ...(this.active?.sampleIds ?? []),
      ...(this.retryIds ?? []),
    ]);
    const index = this.resident.findIndex(
      (entry) => !protectedIds.has(entry.sample.clientSampleId),
    );
    if (index < 0) return false;
    this.resident.splice(index, 1);
    return true;
  }
}
