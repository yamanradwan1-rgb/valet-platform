import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { issue304CreateKeySlot } from "./issue304-create-key-slot";
import {
  clearPhysicalResourceOperationId,
  physicalResourceOperationId,
} from "./physical-resource-operation-id";
import { createKeySlot } from "./physical-resources-api";

vi.mock("./physical-resources-api", () => ({ createKeySlot: vi.fn() }));

const context = { identityGeneration: 22, locationId: "location-A" };
const fakeApi = {} as DashboardApiClient;
const persisted = {
  keySlotId: "persisted-key-id",
  code: "K-14",
  status: "ACTIVE",
  createdAt: "2026-10-20T10:00:00.000Z",
  updatedAt: "2026-10-20T10:00:00.000Z",
};

describe("Issue #304 persisted key creation adapter", () => {
  beforeEach(() => vi.mocked(createKeySlot).mockReset());

  it("keeps the legacy code-only POST compatible", async () => {
    vi.mocked(createKeySlot).mockResolvedValueOnce(persisted as never);
    await expect(issue304CreateKeySlot(fakeApi, context, { code: " K-14 " }))
      .resolves.toBe(persisted);
    expect(createKeySlot).toHaveBeenCalledWith(
      fakeApi,
      context.locationId,
      expect.objectContaining({ code: "K-14", operationId: expect.any(String) }),
    );
    expect(vi.mocked(createKeySlot).mock.calls[0]?.[2]).not.toHaveProperty("label");
  });

  it("forwards optional human label to W3's new persisted schema", async () => {
    vi.mocked(createKeySlot).mockResolvedValueOnce(persisted as never);
    await issue304CreateKeySlot(fakeApi, context, { code: " K-15 ", label: " Front desk " });
    expect(createKeySlot).toHaveBeenCalledWith(
      fakeApi,
      "location-A",
      expect.objectContaining({ code: "K-15", label: "Front desk" }),
    );
  });

  it("preserves the operation ID for an explicit retry after unknown outcome", async () => {
    vi.mocked(createKeySlot)
      .mockRejectedValueOnce(new Error("network: outcome unknown"))
      .mockResolvedValueOnce(persisted as never);
    const draft = { code: "K-16", label: "Front desk B" };
    await expect(issue304CreateKeySlot(fakeApi, context, draft)).rejects.toThrow("outcome unknown");
    const firstId = vi.mocked(createKeySlot).mock.calls[0]?.[2].operationId;
    await issue304CreateKeySlot(fakeApi, context, draft);
    expect(vi.mocked(createKeySlot).mock.calls[1]?.[2].operationId).toBe(firstId);
    expect(vi.mocked(createKeySlot).mock.calls).toHaveLength(2);
  });

  it("isolates operation IDs by Location and auth identity", () => {
    const scopes = [
      context,
      { ...context, locationId: "location-B" },
      { ...context, identityGeneration: 23 },
    ];
    const requestKey = JSON.stringify({ code: "K-17" });
    const ids = scopes.map((scope) => physicalResourceOperationId(
      scope.identityGeneration,
      scope.locationId,
      "key-slot",
      requestKey,
    ));
    expect(new Set(ids).size).toBe(3);
    scopes.forEach((scope) => clearPhysicalResourceOperationId(
      scope.identityGeneration,
      scope.locationId,
      "key-slot",
      requestKey,
    ));
  });
});
