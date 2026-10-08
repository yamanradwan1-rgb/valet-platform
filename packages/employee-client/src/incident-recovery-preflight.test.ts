import { describe, expect, it, vi } from "vitest";
import { IncidentRecoveryState } from "./incident-recovery-state";

const incidentId = "00010203-0405-8607-8809-0a0b0c0d0e0f";
const sessionId = "11111111-1111-4111-8111-111111111111";
const context = {
  installationGeneration: "qa-install",
  locationId: "22222222-2222-4222-8222-222222222222",
  membershipId: "33333333-3333-4333-8333-333333333333",
  organizationId: "44444444-4444-4444-8444-444444444444",
};

describe("Issue 275 stage-specific fail-closed diagnostics", () => {
  it("identifies secure UUID failure as the first failing pre-dispatch stage", async () => {
    const stages: unknown[] = [];
    const read = vi.fn(async () => null);
    const write = vi.fn();
    const reserve = vi.fn();
    const state = new IncidentRecoveryState(
      { read, write, delete: vi.fn() },
      { reserve, read: vi.fn(), retire: vi.fn() },
      () => { throw new Error("sensitive device exception: token=private"); },
      () => 0,
      (event: unknown) => stages.push(event),
    );
    await expect(state.prepare(context, sessionId)).rejects.toThrow();
    expect(stages).toContainEqual({
      outcome: "error",
      stage: "secure-uuid",
    });
    expect(reserve).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(JSON.stringify(stages)).not.toContain("private");
  });

  it("identifies durable marker readback failure without dispatching reservation", async () => {
    const stages: unknown[] = [];
    const reserve = vi.fn();
    const state = new IncidentRecoveryState(
      {
        read: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
        write: vi.fn(async () => undefined),
        delete: vi.fn(),
      },
      { reserve, read: vi.fn(), retire: vi.fn() },
      () => incidentId,
      () => 0,
      (event: unknown) => stages.push(event),
    );
    await expect(state.prepare(context, sessionId)).rejects.toThrow();
    expect(stages).toContainEqual({
      outcome: "error",
      stage: "marker-verify",
    });
    expect(reserve).not.toHaveBeenCalled();
  });

  it.each(["corrupt", "pending"] as const)(
    "fences %s local marker before generating a new UUID",
    async (kind) => {
      const events: unknown[] = [];
      const createId = vi.fn(() => incidentId);
      const reserve = vi.fn();
      const existing = kind === "corrupt" ? { unexpected: "private" } : {
        ...context,
        createdAt: "2026-10-08T10:00:00.000Z",
        incidentId,
        protocol: "actor-bound-intent-v1",
        sessionId,
        version: 1,
      };
      const state = new IncidentRecoveryState(
        {
          read: vi.fn().mockResolvedValue(existing),
          write: vi.fn(),
          delete: vi.fn(),
        },
        { reserve, read: vi.fn(), retire: vi.fn() },
        createId,
        undefined,
        (event) => events.push(event),
      );
      await expect(state.prepare(context, sessionId)).rejects.toThrow();
      expect(events).toContainEqual({
        outcome: "error", stage: "marker-parse",
      });
      expect(createId).not.toHaveBeenCalled();
      expect(reserve).not.toHaveBeenCalled();
      expect(JSON.stringify(events)).not.toContain("private");
    },
  );

  it("rejects invalid injectable ID without reserving an intent", async () => {
    const events: unknown[] = [];
    const reserve = vi.fn();
    const write = vi.fn();
    const state = new IncidentRecoveryState(
      {
        read: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(null),
        write,
        delete: vi.fn(),
      },
      { reserve, read: vi.fn(), retire: vi.fn() },
      () => "not-a-valid-recovery-uuid",
      undefined,
      (event) => events.push(event),
    );
    await expect(state.prepare(context, sessionId)).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
    expect(events).toContainEqual({
      outcome: "error", stage: "secure-uuid",
    });
    expect(reserve).not.toHaveBeenCalled();
  });

  it("never lets a diagnostic callback failure alter secure preparation", async () => {
    let stored: unknown | null = null;
    const reserve = vi.fn().mockResolvedValue({
      expiresAt: "2026-10-08T10:15:00.000Z",
      incidentId,
      outcome: "RESERVED",
      sessionId,
    });
    const state = new IncidentRecoveryState(
      {
        read: async () => stored,
        write: async (value) => { stored = value; },
        delete: async () => { stored = null; },
      },
      { reserve, read: vi.fn(), retire: vi.fn() },
      () => incidentId,
      () => Date.parse("2026-10-08T10:00:00.000Z"),
      () => { throw new Error("telemetry collector unavailable"); },
    );
    const marker = await state.prepare(context, sessionId);
    expect(stored).toEqual(marker);
    await expect(state.reserve(marker)).resolves.toMatchObject({
      outcome: "RESERVED",
    });
    expect(reserve).toHaveBeenCalledOnce();
  });
});
