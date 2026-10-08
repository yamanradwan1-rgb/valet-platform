import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { readGuestPushWorkerDatabaseUrl } from "../src/modules/guest-push/guest-push-worker-database";

const apiUrl =
  "postgresql://valet_api_runtime:api-password@db.example.test:5432/valet";
const workerUrl =
  "postgresql://valet_guest_push_worker:worker-password@db.example.test:5432/valet";
const workerEntrypoint = readFileSync("src/guest-push-worker.ts", "utf8");

describe("Guest Push worker database principal isolation", () => {
  it("requires both the ordinary API URL and the dedicated worker URL", () => {
    expect(() =>
      readGuestPushWorkerDatabaseUrl({
        GUEST_PUSH_WORKER_DATABASE_URL: workerUrl,
      }),
    ).toThrow(/DATABASE_URL/);
    expect(() =>
      readGuestPushWorkerDatabaseUrl({ DATABASE_URL: apiUrl }),
    ).toThrow(/GUEST_PUSH_WORKER_DATABASE_URL/);
  });

  it("rejects the same PostgreSQL principal even when connection details differ", () => {
    expect(() =>
      readGuestPushWorkerDatabaseUrl({
        DATABASE_URL: apiUrl,
        GUEST_PUSH_WORKER_DATABASE_URL:
          "postgresql://valet_api_runtime:other-password@other-db.example.test:6432/other",
      }),
    ).toThrow(/principal must be distinct/);
  });

  it("compares decoded PostgreSQL principals rather than raw URL spelling", () => {
    expect(() =>
      readGuestPushWorkerDatabaseUrl({
        DATABASE_URL:
          "postgresql://valet%5Fapi%5Fruntime:api-password@db.example.test:5432/valet",
        GUEST_PUSH_WORKER_DATABASE_URL: apiUrl,
      }),
    ).toThrow(/principal must be distinct/);
  });

  it("rejects malformed or non-PostgreSQL comparison URLs", () => {
    expect(() =>
      readGuestPushWorkerDatabaseUrl({
        DATABASE_URL: "https://valet_api_runtime@example.test/valet",
        GUEST_PUSH_WORKER_DATABASE_URL: workerUrl,
      }),
    ).toThrow(/valid PostgreSQL DATABASE_URL/);
    expect(() =>
      readGuestPushWorkerDatabaseUrl({
        DATABASE_URL: apiUrl,
        GUEST_PUSH_WORKER_DATABASE_URL:
          "postgresql://:password@db.example.test:5432/valet",
      }),
    ).toThrow(/valid PostgreSQL GUEST_PUSH_WORKER_DATABASE_URL/);
  });

  it("returns only the dedicated URL when principals are distinct", () => {
    expect(
      readGuestPushWorkerDatabaseUrl({
        DATABASE_URL: apiUrl,
        GUEST_PUSH_WORKER_DATABASE_URL: workerUrl,
      }),
    ).toBe(workerUrl);
  });

  it("wires the worker pool only to the dedicated URL and verifies production safety", () => {
    expect(workerEntrypoint).toContain(
      "readGuestPushWorkerDatabaseUrl(process.env)",
    );
    expect(workerEntrypoint).toContain(
      "createRuntimePostgres" + "Pool(workerDatabaseUrl, process.env)",
    );
    expect(workerEntrypoint).not.toContain(
      "createRuntimePostgres" + "Pool(process.env.DATABASE_URL)",
    );
    expect(workerEntrypoint).toContain(
      "verifyProductionRuntimeDatabaseSafety(pool)",
    );
  });
});
