import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../../../../lib/api/dashboard-api-client";
import { studioSettingsCommands } from "./studio-settings-commands";
import type { StudioSettingsSnapshot } from "./studio-settings-types";

const org = "11111111-1111-4111-8111-111111111111";
const location = "22222222-2222-4222-8222-222222222222";
const updatedAt = "2026-10-31T12:00:00.000Z";

function setup(scope: StudioSettingsSnapshot["scope"], keys: StudioSettingsSnapshot["availableKeys"]) {
  const request = vi.fn().mockResolvedValue({});
  const api = { request } as unknown as DashboardApiClient;
  const snapshot: StudioSettingsSnapshot = {
    scope, organizationId: org, locationId: "locationId" in scope ? scope.locationId : null,
    updatedAt, defaults: {}, overrides: {}, effective: {}, overridePresent: {},
    availableKeys: keys,
  };
  return { request, commands: studioSettingsCommands(api, snapshot) };
}

describe("Policies Studio versioned settings commands", () => {
  it("saves a real false Company default and can only clear Company operating hours", async () => {
    const { request, commands } = setup({ kind: "company", organizationId: org }, [
      "tipsEnabled", "operatingHours",
    ]);
    await commands.save("tipsEnabled", false);
    expect(request.mock.calls[0]![0]).toBe("/v1/staff/management/organizations/" + org + "/settings/default");
    expect(request.mock.calls[0]![2]).toMatchObject({
      method: "PUT", body: { setting: "tipsEnabled", value: false, expectedUpdatedAt: updatedAt },
    });
    await expect(commands.clear("tipsEnabled")).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
    await commands.clear("operatingHours");
    expect(request.mock.calls[1]![2]).toMatchObject({
      method: "POST", body: { setting: "operatingHours", expectedUpdatedAt: updatedAt },
    });
  });

  it("sends versioned Location overrides and explicit CLEAR, including SLA", async () => {
    const { request, commands } = setup({
      kind: "management-location", organizationId: org, locationId: location,
    }, ["tipsEnabled", "slaTargetSeconds"]);
    await commands.save("tipsEnabled", false);
    await commands.save("slaTargetSeconds", 300);
    await commands.clear("tipsEnabled");
    expect(request.mock.calls.map((call) => call[0])).toEqual([
      "/v1/staff/management/organizations/" + org + "/locations/" + location + "/settings/override",
      "/v1/staff/management/organizations/" + org + "/locations/" + location + "/settings/override",
      "/v1/staff/management/organizations/" + org + "/locations/" + location + "/settings/override/clear",
    ]);
    for (const [, , options] of request.mock.calls)
      expect(options.body.expectedUpdatedAt).toBe(updatedAt);
    expect(request.mock.calls[2]![2].body).not.toHaveProperty("value");
  });

  it("limits Location Manager writes to its real legacy endpoint and keys", async () => {
    const { request, commands } = setup({ kind: "manager-location", locationId: location }, ["tipsEnabled"]);
    await commands.save("tipsEnabled", false);
    expect(request.mock.calls[0]![0]).toBe("/v1/staff/dashboard/locations/" + location + "/configuration/override");
    await commands.clear("tipsEnabled");
    expect(request.mock.calls[1]![0]).toBe("/v1/staff/dashboard/locations/" + location + "/configuration/override/clear");
    await expect(commands.save("languageDefault", "AR")).rejects.toMatchObject({ kind: "validation" });
    await expect(commands.save("slaTargetSeconds", 300)).rejects.toMatchObject({ kind: "validation" });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("validates types before sending any request", async () => {
    const { request, commands } = setup({ kind: "company", organizationId: org }, ["tipsEnabled"]);
    await expect(commands.save("tipsEnabled", "false")).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
