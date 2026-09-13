export interface RequestSample {
  readonly durationMs: number;
  readonly errorCode?: string;
  readonly operation: string;
  readonly status: number;
}

export interface Summary {
  readonly count: number;
  readonly errorCount: number;
  readonly errorRate: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly requestsPerSecond: number;
}

export interface SafetySnapshot {
  readonly apiCpuPercent: number | null;
  readonly apiRssBytes: number | null;
  readonly databaseActiveConnections: number;
  readonly databaseLockWaiters: number;
  readonly observedAt: string;
}

export interface WorkloadResult {
  readonly concurrency: number;
  readonly durationMs: number;
  readonly maximumInFlight: number;
  readonly name: string;
  readonly retries: 0;
  readonly summary: Summary;
}

export interface AuthenticatedClient {
  readonly accessToken: string;
  readonly allowedSessionIds: readonly string[];
  readonly email: string;
  readonly locationId: string;
  readonly refreshToken: string;
  readonly sentinelSessionId: string;
}
