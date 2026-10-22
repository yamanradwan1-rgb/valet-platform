import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import type {
  AntiAbuseReservation,
  AntiAbuseService,
} from "../src/modules/anti-abuse/anti-abuse.service";
import type { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { GuestInformationService } from "../src/modules/guest-access/guest-information.service";
import { GuestInformationScopeUnavailableError } from "../src/modules/management/guest-information-public-projection";

const readProjection = vi.hoisted(() => vi.fn());
vi.mock(
  "../src/modules/management/guest-information-public-projection",
  () => ({
    GuestInformationScopeUnavailableError: class extends Error {
      readonly code = "GUEST_ACCESS_INVALID";
    },
    readGuestInformationProjection: readProjection,
  }),
);

const locationId = "00000000-0000-4000-8000-000000000102";
const organizationId = "00000000-0000-4000-8000-000000000101";
const bearer = { kind: "LEGACY_BEARER" as const, secret: "A".repeat(43) };
const browser = {
  kind: "BROWSER_SESSION" as const,
  secret: `vgb1.${"B".repeat(43)}`,
};
const reservation = {
  id: "guest-info-reservation",
  key: {
    keyHash: "hash",
    lockHigh: 1,
    lockLow: 2,
    scope: "v1:guest-client-address",
  },
} as AntiAbuseReservation;
const published = {
  locale: "ar",
  privacy: {
    status: "PUBLISHED",
    text: "سياسة منشورة",
    url: null,
    version: 4,
    publishedAt: "2026-10-22T17:00:00.000Z",
  },
  contact: {
    displayName: "Location Support",
    phone: "+962700000001",
    supportUrl: null,
    hours: "09:00–17:00",
  },
};

function context(
  resolved:
    | { scope: string; session: { organizationId: string; locationId: string } }
    | undefined,
) {
  const query = vi.fn(async () => ({ rows: [] }));
  const release = vi.fn();
  const pool = {
    connect: vi.fn(async () => ({ query, release })),
  } as unknown as PostgresPool;
  const finalize = vi.fn(async () => undefined);
  const antiAbuse = {
    finalizeInTransaction: finalize,
  } as unknown as AntiAbuseService;
  const resolve = vi.fn(async () => resolved);
  const guestAccess = {
    resolveAndLockCredentialInTransaction: resolve,
  } as unknown as GuestAccessService;
  const service = new GuestInformationService(pool, antiAbuse, guestAccess);
  return {
    finalize,
    query,
    read: service.read.bind(service),
    release,
    resolve,
  };
}

beforeEach(() => {
  readProjection.mockReset();
  readProjection.mockResolvedValue(published);
});

describe("Guest information reauthorization and scope", () => {
  it.each([bearer, browser])(
    "derives Location and Organization from the currently validated %j credential",
    async (credential) => {
      const fixture = context({
        scope: "ACTIVE",
        session: { locationId, organizationId },
      });
      await expect(
        fixture.read(reservation, credential, "ar"),
      ).resolves.toEqual(published);
      expect(fixture.resolve).toHaveBeenCalledWith(
        expect.anything(),
        credential,
        true,
      );
      expect(readProjection).toHaveBeenCalledOnce();
      expect(readProjection).toHaveBeenCalledWith(expect.anything(), {
        locationId,
        organizationId,
        locale: "ar",
      });
      expect(fixture.finalize).toHaveBeenCalledWith(
        expect.anything(),
        reservation,
        "IGNORED",
      );
      expect(fixture.query).toHaveBeenCalledWith("COMMIT");
      expect(fixture.release).toHaveBeenCalledOnce();
    },
  );

  it("keeps eligible post-visit credentials scoped to the same visit", async () => {
    const fixture = context({
      scope: "POST_VISIT",
      session: { locationId, organizationId },
    });
    await fixture.read(reservation, browser, "en");
    expect(readProjection).toHaveBeenCalledWith(expect.anything(), {
      locationId,
      organizationId,
      locale: "en",
    });
  });

  it("rejects revoked or context-switched credentials before reading privacy", async () => {
    const fixture = context(undefined);
    await expect(
      fixture.read(reservation, browser, "ar"),
    ).rejects.toMatchObject({
      code: "GUEST_ACCESS_INVALID",
    });
    expect(readProjection).not.toHaveBeenCalled();
    expect(fixture.finalize).toHaveBeenCalledWith(
      expect.anything(),
      reservation,
      "COUNTED",
    );
    expect(fixture.query).toHaveBeenCalledWith("COMMIT");
  });

  it("conceals an inactive or removed scoped Location without leaking data", async () => {
    readProjection.mockRejectedValueOnce(
      new GuestInformationScopeUnavailableError(),
    );
    const fixture = context({
      scope: "ACTIVE",
      session: { locationId, organizationId },
    });
    await expect(fixture.read(reservation, bearer, "en")).rejects.toMatchObject(
      {
        code: "GUEST_ACCESS_INVALID",
      },
    );
    expect(fixture.finalize).toHaveBeenCalledWith(
      expect.anything(),
      reservation,
      "COUNTED",
    );
    expect(fixture.query).toHaveBeenCalledWith("COMMIT");
  });

  it("rolls back and does not return stale content when projection fails", async () => {
    readProjection.mockRejectedValueOnce(new Error("database unavailable"));
    const fixture = context({
      scope: "ACTIVE",
      session: { locationId, organizationId },
    });
    await expect(fixture.read(reservation, bearer, "en")).rejects.toThrow(
      "database unavailable",
    );
    expect(fixture.query).toHaveBeenCalledWith("ROLLBACK");
    expect(fixture.query).not.toHaveBeenCalledWith("COMMIT");
    expect(fixture.finalize).not.toHaveBeenCalled();
    expect(fixture.release).toHaveBeenCalledOnce();
  });
});
