import { afterEach, describe, expect, it } from "vitest";

import {
  DEV_MAP_CENTER,
  DEV_MAP_ZOOM,
  OPENFREEMAP_LIBERTY_STYLE_URL,
  getDevLocationBootstrap,
} from "./app-config";

function withEnv(
  vars: Record<string, string | undefined>,
  run: () => void,
): void {
  const previous: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(vars)) {
    previous[name] = process.env[name];
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  try {
    run();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

afterEach(() => {
  delete process.env.NEXT_PUBLIC_DEV_LOCATION_ID;
});

describe("map development configuration", () => {
  it("defaults to the hotel + parking area center without any API key", () => {
    expect(DEV_MAP_CENTER.latitude).toBeCloseTo(32.562703, 6);
    expect(DEV_MAP_CENTER.longitude).toBeCloseTo(35.880055, 6);
    expect(DEV_MAP_ZOOM).toBeGreaterThanOrEqual(17.5);
    expect(DEV_MAP_ZOOM).toBeLessThanOrEqual(18);
  });

  it("uses the key-free OpenFreeMap style endpoint", () => {
    expect(OPENFREEMAP_LIBERTY_STYLE_URL).toContain("openfreemap.org");
    expect(OPENFREEMAP_LIBERTY_STYLE_URL).not.toMatch(/key|token/iu);
  });
});

describe("dev location bootstrap", () => {
  it("returns null when no dev location is configured", () => {
    withEnv({ NEXT_PUBLIC_DEV_LOCATION_ID: undefined }, () => {
      expect(getDevLocationBootstrap()).toBeNull();
    });
  });

  it("returns an explicitly configured single dev location", () => {
    withEnv(
      {
        NEXT_PUBLIC_DEV_LOCATION_ID: "b8a4c410-55f2-4ac6-9d9b-1a4bfe02a001",
        NEXT_PUBLIC_DEV_ORGANIZATION_ID: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        NEXT_PUBLIC_DEV_LOCATION_CURRENCY: "JOD",
        NEXT_PUBLIC_DEV_LOCATION_TIMEZONE: "Asia/Amman",
        NEXT_PUBLIC_DEV_LOCATION_NAME: "Development Hotel",
      },
      () => {
        const bootstrap = getDevLocationBootstrap();
        expect(bootstrap).not.toBeNull();
        expect(bootstrap?.locationId).toBe(
          "b8a4c410-55f2-4ac6-9d9b-1a4bfe02a001",
        );
        expect(bootstrap?.currency).toBe("JOD");
        expect(bootstrap?.timezone).toBe("Asia/Amman");
        expect(bootstrap?.name).toBe("Development Hotel");
      },
    );
  });

  it("treats blank env values as unconfigured", () => {
    withEnv({ NEXT_PUBLIC_DEV_LOCATION_ID: "   " }, () => {
      expect(getDevLocationBootstrap()).toBeNull();
    });
  });
});
