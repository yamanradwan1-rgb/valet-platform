import { randomUUID } from "node:crypto";

import {
  Inject,
  Injectable,
  type NestMiddleware,
  UnauthorizedException,
} from "@nestjs/common";

import {
  createRuntimePostgresPool,
  type PostgresPool,
} from "../../common/database/postgres";

export const CHECK_IN_POSTGRES_POOL = Symbol("CHECK_IN_POSTGRES_POOL");
export const STAFF_PRINCIPAL_RESOLVER = Symbol("STAFF_PRINCIPAL_RESOLVER");
export const CHECK_IN_OPERATION_OBSERVER = Symbol(
  "CHECK_IN_OPERATION_OBSERVER",
);
export const CHECK_IN_MONOTONIC_CLOCK = Symbol("CHECK_IN_MONOTONIC_CLOCK");

export interface StaffPrincipal {
  readonly userId: string;
}

export interface StaffPrincipalResolver {
  resolve(authorization: string | undefined): Promise<StaffPrincipal>;
}

export interface CheckInOperationMeasurement {
  readonly checkInElapsedMs?: number;
  readonly durationMs: number;
  readonly errorCode?: string;
  readonly operation: string;
  readonly outcome: "ERROR" | "SUCCESS";
  readonly requestId: string;
}

export interface CheckInOperationObserver {
  observe(measurement: CheckInOperationMeasurement): Promise<void> | void;
}

export interface MonotonicClock {
  now(): number;
}

export interface CheckInApiRequest {
  checkInElapsedMs?: number;
  checkInOperationMeasured?: boolean;
  checkInRequestId?: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly rawHeaders?: readonly string[];
  readonly socket?: { readonly remoteAddress?: string };
}

interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

type NextFunction = () => void;

const requestIdPattern = /^[A-Za-z0-9._-]{1,128}$/;

export function resolveCheckInRequestId(
  headers: CheckInApiRequest["headers"],
): string {
  const candidate = headers["x-request-id"];
  return typeof candidate === "string" && requestIdPattern.test(candidate)
    ? candidate
    : randomUUID();
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(
    request: CheckInApiRequest,
    response: HeaderResponse,
    next: NextFunction,
  ): void {
    const requestId = resolveCheckInRequestId(request.headers);
    request.checkInRequestId = requestId;
    response.setHeader("X-Request-Id", requestId);
    next();
  }
}

@Injectable()
export class FailClosedStaffPrincipalResolver implements StaffPrincipalResolver {
  async resolve(authorization: string | undefined): Promise<StaffPrincipal> {
    void authorization;
    throw new UnauthorizedException();
  }
}

@Injectable()
export class NoopCheckInOperationObserver implements CheckInOperationObserver {
  observe(measurement: CheckInOperationMeasurement): void {
    void measurement;
    // Production telemetry integration remains an injectable boundary.
  }
}

@Injectable()
export class PerformanceMonotonicClock implements MonotonicClock {
  now(): number {
    return performance.now();
  }
}

export function createCheckInRuntimePool(): PostgresPool {
  return createRuntimePostgresPool(process.env.DATABASE_URL);
}

@Injectable()
export class RuntimePoolLifecycle {
  constructor(
    @Inject(CHECK_IN_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
