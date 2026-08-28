/** Location bootstrap stays scoped to the authenticated principal. */

import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/use-auth", () => ({ useAuth: vi.fn() }));
vi.mock("../../lib/api/location-endpoints", () => ({
  fetchAuthorizedLocations: vi.fn(),
}));

import { fetchAuthorizedLocations } from "../../lib/api/location-endpoints";
import { useAuth } from "../auth/use-auth";
import type { AuthorizedDashboardLocation } from "./location-bootstrap-state";
import {
  LocationProvider,
  useDashboardLocations,
} from "./location-context";
import { installMinimalBrowser } from "../map-setup/setup-map.integration.test-double";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function location(locationId: string): AuthorizedDashboardLocation {
  return {
    currency: "JOD",
    locationId,
    name: locationId,
    organizationId: `org-${locationId}`,
    timezone: "Asia/Amman",
  };
}

let latest: ReturnType<typeof useDashboardLocations> | null = null;
let restoreBrowser: () => void = () => undefined;

function Probe() {
  const context = useDashboardLocations();
  useLayoutEffect(() => {
    latest = context;
  }, [context]);
  return null;
}

function auth(email: string | null, status = "authenticated") {
  return {
    client: {},
    session: email === null ? null : { email },
    status,
  };
}

function mount(): { rerender: () => void; unmount: () => void } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const rerender = () => {
    act(() => {
      root.render(
        <LocationProvider>
          <Probe />
        </LocationProvider>,
      );
    });
  };
  rerender();
  return {
    rerender,
    unmount: () => {
      act(() => root.unmount());
      document.body.removeChild(container);
    },
  };
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function snapshot() {
  expect(latest).not.toBeNull();
  return latest!;
}

describe("LocationProvider principal isolation", () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    restoreBrowser = installMinimalBrowser();
    latest = null;
    vi.mocked(useAuth).mockReturnValue(auth("a@example.test") as never);
  });

  afterEach(() => {
    restoreBrowser();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
    vi.clearAllMocks();
  });

  it("hides A synchronously while B authorization is loading and revalidates selection", async () => {
    const a = deferred<readonly AuthorizedDashboardLocation[]>();
    const b = deferred<readonly AuthorizedDashboardLocation[]>();
    vi.mocked(fetchAuthorizedLocations).mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const harness = mount();
    a.resolve([location("A-1"), location("A-2")]);
    await settle();
    act(() => snapshot().selectLocation("A-2"));
    expect(snapshot().location?.locationId).toBe("A-2");

    vi.mocked(useAuth).mockReturnValue(auth("b@example.test") as never);
    harness.rerender();
    expect(snapshot()).toMatchObject({ locations: [], location: null, status: "loading" });

    b.resolve([location("B-1")]);
    await settle();
    expect(snapshot().locations.map((entry) => entry.locationId)).toEqual(["B-1"]);
    expect(snapshot().location?.locationId).toBe("B-1");
    harness.unmount();
  });

  it("cannot let a superseded A request overwrite B, and hides state outside authentication", async () => {
    const a = deferred<readonly AuthorizedDashboardLocation[]>();
    const b = deferred<readonly AuthorizedDashboardLocation[]>();
    vi.mocked(fetchAuthorizedLocations).mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const harness = mount();

    vi.mocked(useAuth).mockReturnValue(auth("b@example.test") as never);
    harness.rerender();
    b.resolve([location("B-1")]);
    await settle();
    a.resolve([location("A-1")]);
    await settle();
    expect(snapshot().locations.map((entry) => entry.locationId)).toEqual(["B-1"]);

    for (const status of ["unauthenticated", "signing-out", "logout-failed", "restoring"]) {
      vi.mocked(useAuth).mockReturnValue(auth(null, status) as never);
      harness.rerender();
      expect(snapshot()).toMatchObject({ locations: [], location: null, status: "loading" });
    }
    harness.unmount();
  });
});
