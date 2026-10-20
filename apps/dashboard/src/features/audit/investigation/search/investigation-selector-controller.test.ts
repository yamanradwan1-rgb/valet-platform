import { describe, expect, it, vi } from "vitest";
import type { AuditInvestigationFilterResponse } from "@valet/contracts";
import { InvestigationSelectorController } from "./investigation-selector-controller";

const scope = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  locationId: "22222222-2222-4222-8222-222222222222",
  role: "COMPANY_ADMIN" as const,
  identityGeneration: 1,
  sessionGeneration: 1,
  selectionRevision: 1,
};
const id = "55555555-5555-4555-8555-555555555555";
const result: AuditInvestigationFilterResponse = {
  kind: "KEY_SLOT",
  items: [
    {
      id,
      currentLabel: { basis: "CURRENT", value: "K-07", unavailable: false },
    },
  ],
  nextCursor: null,
  hasMore: false,
};
const api = {} as Parameters<InvestigationSelectorController["select"]>[0];

describe("W5 canonical selector lifecycle", () => {
  it("fetches only after exact scope, keeps canonical IDs, and clears on change", async () => {
    const read = vi.fn().mockResolvedValue(result);
    const controller = new InvestigationSelectorController(read);
    expect(await controller.select(api, { kind: "KEY_SLOT" })).toBe(false);
    controller.configure(scope);
    expect(await controller.select(api, { kind: "KEY_SLOT" })).toBe(true);
    expect(controller.snapshot()).toEqual({
      kind: "KEY_SLOT",
      options: [
        { id, label: { basis: "CURRENT", value: "K-07", unavailable: false } },
      ],
      nextCursor: null,
      hasMore: false,
    });
    controller.configure({ ...scope, sessionGeneration: 2 });
    expect(controller.snapshot()).toBeNull();
  });

  it("invalidates in-flight selector on Location change and auth refresh", async () => {
    const callbacks: Array<{
      signal: AbortSignal;
      complete: (result: AuditInvestigationFilterResponse) => void;
      reconciled: () => void;
    }> = [];
    const controller = new InvestigationSelectorController(
      (ctx) =>
        new Promise((complete) =>
          callbacks.push({
            signal: ctx.signal,
            reconciled: ctx.onAuthReconciled,
            complete,
          }),
        ),
    );
    controller.configure(scope);
    const old = controller.select(api, { kind: "KEY_SLOT" });
    controller.configure({
      ...scope,
      locationId: "77777777-7777-4777-8777-777777777777",
    });
    expect(callbacks[0]!.signal.aborted).toBe(true);
    callbacks[0]!.complete(result);
    expect(await old).toBe(false);
    const newer = controller.select(api, { kind: "KEY_SLOT" });
    callbacks[1]!.reconciled();
    callbacks[1]!.complete(result);
    expect(await newer).toBe(false);
    expect(controller.snapshot()).toBeNull();
    expect(await controller.select(api, { kind: "KEY_SLOT" })).toBe(false);
  });

  it("refuses selector text with unsupported fields or mismatched kind", async () => {
    const reader = vi.fn().mockResolvedValue(result);
    const controller = new InvestigationSelectorController(reader);
    controller.configure(scope);
    await expect(
      controller.select(api, { kind: "KEY_SLOT", limit: 500 }),
    ).rejects.toThrow();
    await expect(
      controller.select(api, { kind: "KEY_SLOT", phone: "123" }),
    ).rejects.toThrow();
    expect(reader).not.toHaveBeenCalled();
    await expect(controller.select(api, { kind: "MEMBER" })).rejects.toThrow(
      "kind mismatch",
    );
    expect(controller.snapshot()).toBeNull();
  });
});
