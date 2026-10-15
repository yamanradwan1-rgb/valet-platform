import type { Pool } from "pg";

export interface Scope {
  readonly orgId: string;
  readonly locationId: string;
  readonly memberId: string;
  readonly sessionId: string;
  readonly userId: string;
}

export interface RaceContext {
  readonly dbUrl: string;
  readonly pool: Pool;
  start(): Promise<void>;
  stop(): Promise<void>;
  seed(): Promise<Scope>;
}
