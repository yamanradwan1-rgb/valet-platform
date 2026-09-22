import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import type { SelectedDashboardScope } from "../scope";
import { resolveSelectedScopeBaseAuthority } from "./selected-scope-base-authority";

const organization = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  name: "Org",
  timezone: "Asia/Amman",
};
const location = {
  locationId: "22222222-2222-4222-8222-222222222222",
  name: "Main",
  code: "MAIN",
  status: "ACTIVE" as const,
  timezone: "Asia/Amman",
  currency: "JOD",
};
const scope: SelectedDashboardScope = {
  authority: "LOCATION_MANAGER",
  organization,
  location,
};
const response = {
  locationId: location.locationId,
  organizationId: organization.organizationId,
  subscription: {
    planCode: "PRO",
    status: "ACTIVE" as const,
    entitlements: {
      basicBranding: true,
      dashboardAccess: true,
      reportExports: false,
    },
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function client(request: ReturnType<typeof vi.fn>): DashboardApiClient {
  return { request } as unknown as DashboardApiClient;
}

describe("shared selected-scope base reads", () => {
  it("does not start a base read for a pre-aborted lifecycle", async () => {
    const request = vi.fn().mockResolvedValue(response);
    const api = client(request);
    const controller = new AbortController();
    controller.abort();

    await expect(resolveSelectedScopeBaseAuthority(
      api,
      scope,
      { includeCompanyContext: true },
      controller.signal,
      "session:identity:revision:scope",
    )).rejects.toBe(controller.signal.reason);
    expect(request).not.toHaveBeenCalled();
  });

  it("dedupes only the in-flight read and never caches settled positive authority", async () => {
    const first = deferred<typeof response>();
    const request = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(response);
    const api = client(request);
    const firstRoute = resolveSelectedScopeBaseAuthority(
      api,
      scope,
      { includeCompanyContext: false },
      undefined,
      "session:identity:revision:scope",
    );
    const sameCycleNavigation = resolveSelectedScopeBaseAuthority(
      api,
      scope,
      { includeCompanyContext: true },
      undefined,
      "session:identity:revision:scope",
    );

    expect(request).toHaveBeenCalledTimes(1);
    first.resolve(response);
    await expect(Promise.all([firstRoute, sameCycleNavigation])).resolves.toEqual([
      expect.objectContaining({ status: "valid" }),
      expect.objectContaining({ status: "valid" }),
    ]);

    await resolveSelectedScopeBaseAuthority(
      api,
      scope,
      { includeCompanyContext: true },
      undefined,
      "session:identity:revision:scope",
    );
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("keeps a shared request alive when only one lifecycle aborts", async () => {
    const pending = deferred<typeof response>();
    let sharedSignal: AbortSignal | undefined;
    const request = vi.fn((_path: string, _schema: unknown, options?: {
      readonly signal?: AbortSignal;
    }) => {
      sharedSignal = options?.signal;
      return pending.promise;
    });
    const api = client(request);
    const routeController = new AbortController();
    const navigationController = new AbortController();
    const route = resolveSelectedScopeBaseAuthority(
      api,
      scope,
      { includeCompanyContext: false },
      routeController.signal,
      "session:identity:revision:scope",
    );
    const navigation = resolveSelectedScopeBaseAuthority(
      api,
      scope,
      { includeCompanyContext: true },
      navigationController.signal,
      "session:identity:revision:scope",
    );

    routeController.abort();
    await expect(route).rejects.toBe(routeController.signal.reason);
    expect(sharedSignal?.aborted).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);

    pending.resolve(response);
    await expect(navigation).resolves.toMatchObject({ status: "valid" });
  });
});
