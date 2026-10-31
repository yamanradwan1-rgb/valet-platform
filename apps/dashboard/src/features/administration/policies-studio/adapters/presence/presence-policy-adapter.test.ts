import { describe, expect, it, vi } from "vitest";
import { companyPolicy, locationPolicy } from "../../../../../../e2e/support/presence-data";
import type { PresenceApi } from "../../../settings/shift-presence-api";
import type { PresenceMutation } from "../../../settings/use-shift-presence-mutation";
import {
  presenceFields,
  presenceFieldSnapshot,
  presencePolicyContext,
  presencePolicyFieldIdentity,
  type Field,
  type PresencePolicyDraftState,
} from "../../../settings/shift-presence-policy-fields";
import { saveStudioPresencePolicy } from "./presence-policy-adapter";

function draftFor(
  data: ReturnType<typeof locationPolicy> | ReturnType<typeof companyPolicy>,
  fieldName: Field["field"],
  source: "CUSTOM" | "INHERIT",
  value: string,
): PresencePolicyDraftState {
  const field = presenceFields.find((item) => item.field === fieldName)!;
  const snapshot = presenceFieldSnapshot(data, field);
  return {
    source,
    draft: value,
    touched: true,
    baselineKey: presencePolicyFieldIdentity(
      presencePolicyContext(data),
      snapshot.effectiveValue,
      snapshot.override,
    ),
    baselineValue: snapshot.effectiveValue,
    baselineOverride: snapshot.override,
  };
}

function dependencies() {
  const api = {
    setPolicy: vi.fn().mockResolvedValue(locationPolicy()),
    clearPolicy: vi.fn().mockResolvedValue(locationPolicy()),
  };
  const mutation = {
    blocked: false,
    run: vi.fn(async (
      _intent: unknown,
      operation: () => Promise<{ kind: "POLICY"; value: unknown }>,
    ): Promise<{ kind: "POLICY"; value: unknown } | null> => operation()),
  };
  return {
    api,
    mutation,
    deps: {
      api: api as unknown as Pick<PresenceApi, "setPolicy" | "clearPolicy">,
      mutation: mutation as unknown as Pick<PresenceMutation, "run" | "blocked">,
      current: () => true,
    },
  };
}

describe("Policies Studio presence policy adapter", () => {
  it("blocks strict activation until explicit confirmation", async () => {
    const data = locationPolicy();
    const { mutation, deps } = dependencies();
    const outcome = await saveStudioPresencePolicy(
      data, "shiftStartPresenceMode",
      draftFor(data, "shiftStartPresenceMode", "CUSTOM", "REQUIRE"),
      false, deps,
    );
    expect(outcome).toBe("STRICT_CONFIRMATION_REQUIRED");
    expect(mutation.run).not.toHaveBeenCalled();
  });

  it("sends exactly one typed CAS write through the retained mutation executor", async () => {
    const data = locationPolicy();
    const { api, mutation, deps } = dependencies();
    const outcome = await saveStudioPresencePolicy(
      data, "shiftEndPresenceMode",
      draftFor(data, "shiftEndPresenceMode", "CUSTOM", "WARN_ONLY"),
      false, deps,
    );
    expect(outcome).toBe("SAVED");
    expect(mutation.run).toHaveBeenCalledTimes(1);
    expect(mutation.run.mock.calls[0]?.[0]).toMatchObject({
      query: { kind: "POLICY" }, mutationId: expect.any(String),
    });
    const intent = mutation.run.mock.calls[0]?.[0] as { mutationId: string };
    expect(api.setPolicy).toHaveBeenCalledWith(expect.objectContaining({
      field: "shiftEndPresenceMode",
      value: "WARN_ONLY",
      expectedRevision: data.overrides.revision,
      expectedCompanyRevision: data.company.revision,
      configurationFingerprint: data.readiness.configurationFingerprint,
      mutationId: intent.mutationId,
    }));
  });

  it("guards stale drafts and revoked read-only capability before any write", async () => {
    const data = locationPolicy();
    const { mutation, deps } = dependencies();
    const stale = draftFor(data, "shiftStartPresenceMode", "CUSTOM", "OFF");
    expect(await saveStudioPresencePolicy(
      data, "shiftStartPresenceMode", { ...stale, baselineKey: "old" },
      true, deps,
    )).toBe("CONFLICT");
    data.capabilities.canEdit = false;
    expect(await saveStudioPresencePolicy(
      data, "shiftStartPresenceMode", stale, true, deps,
    )).toBe("BLOCKED");
    expect(mutation.run).not.toHaveBeenCalled();
  });

  it("requires strict confirmation when clearing a location override inherits strict Company mode", async () => {
    const data = locationPolicy();
    data.company.startMode = "REQUIRE_OR_OVERRIDE";
    data.overrides.startModeOverride = "WARN_ONLY";
    data.effective.startMode = "WARN_ONLY";
    const { api, mutation, deps } = dependencies();
    const draft = draftFor(data, "shiftStartPresenceMode", "INHERIT", "WARN_ONLY");
    expect(await saveStudioPresencePolicy(
      data, "shiftStartPresenceMode", draft, false, deps,
    )).toBe("STRICT_CONFIRMATION_REQUIRED");
    expect(mutation.run).not.toHaveBeenCalled();
    expect(await saveStudioPresencePolicy(
      data, "shiftStartPresenceMode", draft, true, deps,
    )).toBe("SAVED");
    expect(api.clearPolicy).toHaveBeenCalledWith(expect.objectContaining({
      expectedRevision: data.overrides.revision,
      field: "shiftStartPresenceMode",
    }));
  });

  it("does not report saved when the exact result remains unresolved", async () => {
    const data = companyPolicy();
    const { api, mutation, deps } = dependencies();
    mutation.run.mockImplementationOnce(async () => null);
    expect(await saveStudioPresencePolicy(
      data, "shiftStartPresenceMode",
      draftFor(data, "shiftStartPresenceMode", "CUSTOM", "WARN_ONLY"),
      false, deps,
    )).toBe("UNRESOLVED");
    expect(api.setPolicy).not.toHaveBeenCalled();
  });
});
