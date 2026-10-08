import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IncidentRecoveryMarker, IncidentRecoveryStore } from "@valet/employee-client";

import { NativeIncidentSession } from "../src/incident/native-incident-session";
import { createNativeIncidentRecoveryState } from "../src/incident/native-incident-recovery-runtime";
import {
  BoundedTelemetryBuffer,
  NativeTelemetryOwner,
  installNativeTelemetry,
  resetNativeTelemetryRegistryForTests,
} from "../src/telemetry/native-telemetry-owner";
import { detail, sessionId } from "./native-parity-11-test-fixture";

const incidentId = "00010203-0405-8607-8809-0a0b0c0d0e0f";
const context = {
  installationGeneration: "test-install",
  locationId: "11111111-1111-4111-8111-111111111111",
  membershipId: "22222222-2222-4222-8222-222222222222",
  organizationId: "33333333-3333-4333-8333-333333333333",
};
const input = {
  description: "private incident description -- do not log",
  severity: "CRITICAL" as const,
  type: "VEHICLE_DAMAGE" as const,
};
const report = {
  createdAt: "2026-10-08T10:00:00.000Z",
  incidentId,
  reportedByMembershipId: context.membershipId,
  sessionId,
  severity: input.severity,
  status: "OPEN",
  type: input.type,
};
const reserved = {
  expiresAt: "2026-10-08T10:15:00.000Z",
  incidentId,
  outcome: "RESERVED",
  sessionId,
};
type Request = { body?: unknown; method: string; path: string };
type Mode = "success" | "reserve-lost" | "report-lost" | "malformed-report";

function setup(mode: Mode = "success", storeOverride?: IncidentRecoveryStore) {
  let marker: IncidentRecoveryMarker | null = null;
  const store: IncidentRecoveryStore = storeOverride ?? {
    async read() { return marker; },
    async write(value) { marker = value; },
    async delete() { marker = null; },
  };
  const request = vi.fn(async ({ method, path }: Request) => {
    if (method === "GET" && path.endsWith("/recovery")) {
      return mode === "report-lost"
        ? { outcome: "FOUND", report }
        : reserved;
    }
    if (method === "GET") return detail();
    if (path.endsWith("/recovery-intent")) {
      if (mode === "reserve-lost")
        throw new Error("private bearer: must not enter telemetry");
      return reserved;
    }
    if (mode === "report-lost")
      throw new Error("private report response content");
    if (mode === "malformed-report") return { arbitrary: "private" };
    return report;
  });
  const client = () => ({ request }) as never;
  const session = new NativeIncidentSession(
    client, createNativeIncidentRecoveryState(store, client),
  );
  return { request, session, store };
}

async function open(session: NativeIncidentSession) {
  await session.observeRecoveryContext(context);
  await session.open({ origin: "PARKING", sessionId });
  expect(session.current().phase).toBe("form");
}

function mutations(request: ReturnType<typeof vi.fn>) {
  const entries = request.mock.calls.map((args: unknown[]) => args[0] as Request);
  return {
    incident: entries.filter(({ method, path }) =>
      method === "POST" && path.endsWith("/incidents")),
    reservation: entries.filter(({ method, path }) =>
      method === "POST" && path.endsWith("/recovery-intent")),
  };
}

let ring: BoundedTelemetryBuffer;
beforeEach(() => {
  resetNativeTelemetryRegistryForTests();
  ring = new BoundedTelemetryBuffer();
  installNativeTelemetry(new NativeTelemetryOwner(ring, {
    appBuild: "test", appVersion: "test", platform: "android",
  }));
  const source = Uint8Array.from({ length: 16 }, (_, index) => index);
  vi.stubGlobal("crypto", {
    getRandomValues: (bytes: Uint8Array) => {
      bytes.set(source);
      return bytes;
    },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetNativeTelemetryRegistryForTests();
});

function has(stage: string, outcome: string) {
  return ring.current().some((event) =>
    event.source === "recovery" &&
    event.classification === "preflight" &&
    event.errorCode === `${stage}.${outcome}`);
}

describe("Issue 275 Native runtime composition / preflight", () => {
  it("makes valid secure UUIDv8, durable marker, reserved intent and one report", async () => {
    const { request, session } = setup();
    await open(session);
    expect(await session.submit(input)).toBe(true);
    expect(session.current()).toMatchObject({ phase: "success", report });
    expect(mutations(request)).toMatchObject({
      reservation: [expect.anything()],
      incident: [expect.anything()],
    });
    for (const stage of [
      "session-detail-transport", "session-detail-response",
      "context", "input-validation", "storage-read", "secure-uuid",
      "storage-write", "storage-readback", "marker-verify",
      "reserve-transport", "reserve-response", "reserve-binding",
      "report-transport", "report-response",
    ]) expect(has(stage, "success")).toBe(true);
    const posted = mutations(request).incident[0]!;
    expect(posted.body).toMatchObject({ incidentId });
    expect(JSON.stringify(ring.current())).not.toContain(input.description);
    expect(JSON.stringify(ring.current())).not.toContain(incidentId);
    expect(JSON.stringify(ring.current())).not.toContain(context.membershipId);
  });

  it.each(["missing", "throwing"] as const)(
    "fails closed when release-like CSPRNG is %s, with no mutation",
    async (caseName) => {
      vi.stubGlobal("crypto", caseName === "missing" ? {} : {
        getRandomValues: () => { throw new Error("sensitive seed"); },
      });
      const { request, session } = setup();
      await open(session);
      expect(await session.submit(input)).toBe(false);
      expect(has("secure-uuid", "error")).toBe(true);
      expect(mutations(request)).toEqual({ reservation: [], incident: [] });
      expect(JSON.stringify(ring.current())).not.toContain("sensitive");
    },
  );

  it.each(["read", "write", "readback", "mismatch"] as const)(
    "keeps zero mutations on SecureStore %s failure",
    async (failure) => {
      let count = 0;
      let stored: IncidentRecoveryMarker | null = null;
      const store: IncidentRecoveryStore = {
        async read() {
          count += 1;
          if (failure === "read" && count === 2) throw new Error("private read");
          if (failure === "readback" && count === 3) throw new Error("private readback");
          if (failure === "mismatch" && count === 3) return null;
          return stored;
        },
        async write(value) {
          if (failure === "write") throw new Error("private write");
          stored = value;
        },
        async delete() { stored = null; },
      };
      const { request, session } = setup("success", store);
      await open(session);
      expect(await session.submit(input)).toBe(false);
      expect(mutations(request)).toEqual({ reservation: [], incident: [] });
      const stage = failure === "read" ? "storage-read"
        : failure === "write" ? "storage-write"
          : failure === "readback" ? "storage-readback" : "marker-verify";
      expect(has(stage, "error")).toBe(true);
    },
  );

  it("rejects invalid Incident form input before any mutation", async () => {
    const { session, request } = setup();
    await open(session);
    expect(await session.submit({ ...input, description: "" })).toBe(false);
    expect(has("input-validation", "error")).toBe(true);
    expect(mutations(request)).toEqual({ reservation: [], incident: [] });
  });

  it("rejects missing recovered context before generating an operation", async () => {
    const { request, session } = setup();
    await session.open({ origin: "PARKING", sessionId });
    expect(await session.submit(input)).toBe(false);
    expect(has("context", "error")).toBe(true);
    expect(mutations(request)).toEqual({ reservation: [], incident: [] });
  });

  it("classifies a failed canonical session-detail read without any Incident mutation", async () => {
    const request = vi.fn(async () => {
      throw new Error("do-not-log-secret-session-data");
    });
    const session = new NativeIncidentSession(
      () => ({ request }) as never,
    );
    await session.open({ origin: "PARKING", sessionId });
    expect(session.current().phase).toBe("context-error");
    expect(has("session-detail-transport", "error")).toBe(true);
    expect(mutations(request)).toEqual({ reservation: [], incident: [] });
    expect(JSON.stringify(ring.current())).not.toContain("do-not-log-secret");
  });

  it("never sends report after a reservation response is lost", async () => {
    const { session, request } = setup("reserve-lost");
    await open(session);
    expect(await session.submit(input)).toBe(false);
    expect(has("reserve-transport", "error")).toBe(true);
    expect(mutations(request).reservation).toHaveLength(1);
    expect(mutations(request).incident).toHaveLength(0);
    expect(session.current().phase).toBe("recovery-reserved");
  });

  it("does not replay the report when its response is lost", async () => {
    const { session, request } = setup("report-lost");
    await open(session);
    expect(await session.submit(input)).toBe(false);
    expect(has("report-transport", "error")).toBe(true);
    expect(mutations(request).reservation).toHaveLength(1);
    expect(mutations(request).incident).toHaveLength(1);
    expect(session.current().phase).toBe("success");
  });

  it("rejects invalid canonical report response without replay", async () => {
    const { session, request } = setup("malformed-report");
    await open(session);
    expect(await session.submit(input)).toBe(false);
    expect(has("report-response", "error")).toBe(true);
    expect(mutations(request).incident).toHaveLength(1);
    expect(session.current().phase).toBe("recovery-reserved");
  });
});
