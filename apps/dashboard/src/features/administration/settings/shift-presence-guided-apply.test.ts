import { describe, expect, it } from "vitest";
import { locationPolicy } from "../../../../e2e/support/presence-data";
import type { PresenceLocation, PresenceApi } from "./shift-presence-api";
import type { PresenceMutation } from "./use-shift-presence-mutation";
import {
  presenceFields, presencePolicyContext, presencePolicyFieldIdentity,
  type PresencePolicyDrafts, type PresencePolicyDraftState, type Field,
} from "./shift-presence-policy-fields";
import {
  applyGuidedPlan, guidedPlan, guidedPlanError, type GuidedApplyDeps,
} from "./shift-presence-guided-apply";

function location(): PresenceLocation {
  return locationPolicy();
}

function draft(data: PresenceLocation, field: Field, value: string,
               source: "INHERIT" | "CUSTOM"): PresencePolicyDraftState {
  return {
    source, draft: value, touched: true,
    baselineKey: presencePolicyFieldIdentity(presencePolicyContext(data),
      data.effective[field.key], data.overrides[field.override]),
    baselineValue: data.effective[field.key],
    baselineOverride: data.overrides[field.override],
  };
}

function harness(data: PresenceLocation, outcome: "OK" | "UNKNOWN" = "OK") {
  let server = data;
  const writes: { field: string; body: Record<string, unknown> }[] = [];
  const api = {
    policy: async () => server,
    setPolicy: async (body: Record<string, unknown>) => {
      writes.push({ field: String(body.field), body });
      const def = presenceFields.find((entry) => entry.field === body.field)!;
      server = {
        ...server,
        overrides: { ...server.overrides, [def.override]: body.value,
          revision: server.overrides.revision + 1 },
        effective: { ...server.effective, [def.key]: body.value },
        readiness: { ...server.readiness,
          configurationFingerprint: server.readiness.configurationFingerprint === "a".repeat(64)
            ? "b".repeat(64) : "c".repeat(64),
          locationRevision: server.overrides.revision + 1 },
      };
      return server;
    },
    clearPolicy: async (body: Record<string, unknown>) => {
      writes.push({ field: String(body.field), body });
      const def = presenceFields.find((entry) => entry.field === body.field)!;
      server = {
        ...server,
        overrides: { ...server.overrides,
          [def.override]: null, revision: server.overrides.revision + 1 },
        effective: { ...server.effective, [def.key]: server.company[def.key] },
        readiness: { ...server.readiness, configurationFingerprint: "d".repeat(64) },
      };
      return server;
    },
  };
  const mutation = {
    blocked: false, denied: false, pending: null,
    run: async (_: unknown, operation: () => Promise<unknown>) =>
      outcome === "UNKNOWN" ? null : operation(),
  };
  return { writes, api: api as unknown as PresenceApi,
    mutation: mutation as unknown as PresenceMutation, get server() { return server; } };
}

function deps(h: ReturnType<typeof harness>, onCommitted = () => {}) {
  return {
    api: h.api, mutation: h.mutation, isCurrent: () => true,
    onCommitted,
  } satisfies GuidedApplyDeps;
}

describe("independent guided apply", () => {
  it("C10 Off/Off requires no zone and saves explicit Custom OFF", async () => {
    const original = location();
    const saved: PresenceLocation = { ...original, readiness: {
      ...original.readiness, activeZoneCount: 0,
      configurationUsable: false, strictActivationAllowed: false,
    }};
    const field = presenceFields[0]!;
    const plan = guidedPlan(saved, { [field.field]: draft(saved, field, "OFF", "CUSTOM") });
    expect(plan.actions.map((entry) => entry.intent.kind)).toEqual(["SET"]);
    const h = harness(saved);
    const result = await applyGuidedPlan(plan, deps(h));
    expect(result).toMatchObject({ committed: ["shiftStartPresenceMode"], stopped: null });
    expect(h.writes[0]?.body).toMatchObject({ field: "shiftStartPresenceMode",
      expectedRevision: 1, expectedCompanyRevision: 1, value: "OFF" });
  });

  it("applies four independent Custom fields with fresh CAS after each own receipt", async () => {
    const saved = location();
    const proposals: PresencePolicyDrafts = Object.fromEntries(
      presenceFields.map((f, i) => [f.field,
        draft(saved, f, ["WARN_ONLY", "OFF", "75", "45"][i]!, "CUSTOM")]),
    );
    const plan = guidedPlan(saved, proposals);
    expect(plan.actions).toHaveLength(4);
    const h = harness(saved);
    const result = await applyGuidedPlan(plan, deps(h));
    expect(result.stopped).toBeNull();
    expect(result.committed).toHaveLength(4);
    expect(h.writes.map((item) => item.body.expectedRevision)).toEqual([1, 2, 3, 4]);
    expect(new Set(h.writes.map((item) => item.body.mutationId)).size).toBe(4);
  });

  it("does not write after a conflicting external policy revision", async () => {
    const saved = location();
    const f = presenceFields[0]!;
    const plan = guidedPlan(saved, { [f.field]: draft(saved, f, "WARN_ONLY", "CUSTOM") });
    const h = harness({ ...saved,
      overrides: { ...saved.overrides, revision: 4 } });
    const result = await applyGuidedPlan(plan, deps(h));
    expect(result.stopped).toBe("CONFLICT");
    expect(h.writes).toHaveLength(0);
  });

  it("fails closed on strict readiness; no fabricated map-zone count", async () => {
    const original = location();
    const saved: PresenceLocation = { ...original, readiness: {
      ...original.readiness, activeZoneCount: 0, configurationUsable: false,
    }};
    const f = presenceFields[0]!;
    const plan = guidedPlan(saved, { [f.field]: draft(saved, f, "REQUIRE", "CUSTOM") });
    const h = harness(saved);
    expect((await applyGuidedPlan(plan, deps(h))).stopped).toBe("NOT_READY");
    expect(h.writes).toHaveLength(0);
  });

  it("does not replay UNKNOWN and keeps later fields untouched", async () => {
    const saved = location();
    const proposals = Object.fromEntries(presenceFields.slice(0, 2)
      .map((f) => [f.field, draft(saved, f, "WARN_ONLY", "CUSTOM")]));
    const plan = guidedPlan(saved, proposals);
    const h = harness(saved, "UNKNOWN");
    expect((await applyGuidedPlan(plan, deps(h))).stopped).toBe("BLOCKED");
    expect(h.writes).toHaveLength(0);
  });

  it("stops after scope cancellation and keeps confirmed receipt", async () => {
    const saved = location();
    const proposals = Object.fromEntries(presenceFields.slice(0, 2)
      .map((f) => [f.field, draft(saved, f, "WARN_ONLY", "CUSTOM")]));
    const plan = guidedPlan(saved, proposals);
    const h = harness(saved);
    let live = true;
    const result = await applyGuidedPlan(plan, {
      ...deps(h), isCurrent: () => live, onCommitted: () => { live = false; },
    });
    expect(result.committed).toEqual(["shiftStartPresenceMode"]);
    expect(result.stopped).toBe("CANCELLED");
    expect(h.writes).toHaveLength(1);
    expect(guidedPlanError(plan)).toBeNull();
  });
});
