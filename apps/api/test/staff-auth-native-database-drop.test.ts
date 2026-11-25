import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertStaffAuthFixtureEndpoints,
  closeStaffAuthFixturePools,
  dropStaffAuthFixtureDatabase,
} from "./staff-auth-native-database-drop";
import { cleanupStaffAuthNativeFixture } from "./staff-auth-native-fixture-cleanup";

const databaseName = "valet_mob007_auth_123_abc123ef";
const fixtureUrl = `postgresql://fixture:secret@127.0.0.1:5432/${databaseName}`;
const symbol = Symbol.for("vaylet.test.postgres.close-owned-pools");
const previous = Object.getOwnPropertyDescriptor(globalThis, symbol);

afterEach(() => {
  if (previous !== undefined)
    Object.defineProperty(globalThis, symbol, previous);
  else Reflect.deleteProperty(globalThis, symbol);
});

describe("Staff Auth fixture database cleanup", () => {
  it("retries only SQLSTATE 55006 and drops the exact generated database without FORCE", async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("sessions remain"), { code: "55006" }),
      )
      .mockResolvedValue({ rowCount: null });
    await dropStaffAuthFixtureDatabase({ query } as never, databaseName);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query).toHaveBeenCalledWith(
      `DROP DATABASE IF EXISTS "${databaseName}"`,
    );
  });

  it("fails closed for other errors and for exhausted 55006 retry budget", async () => {
    const denied = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("permission denied"), { code: "42501" }),
      );
    await expect(
      dropStaffAuthFixtureDatabase({ query: denied } as never, databaseName),
    ).rejects.toMatchObject({ code: "42501" });
    expect(denied).toHaveBeenCalledTimes(1);

    const busy = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("sessions remain"), { code: "55006" }),
      );
    await expect(
      dropStaffAuthFixtureDatabase({ query: busy } as never, databaseName),
    ).rejects.toMatchObject({ code: "55006" });
    expect(busy).toHaveBeenCalledTimes(3);
  });

  it("rejects unowned names before SQL and invokes only the exact registry target", async () => {
    const query = vi.fn();
    await expect(
      dropStaffAuthFixtureDatabase(
        { query } as never,
        "valet_mob007_auth_123_abc123ef;drop schema public",
      ),
    ).rejects.toThrow(/exact owned database/);
    expect(query).not.toHaveBeenCalled();
    const close = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, symbol, {
      configurable: true,
      value: close,
    });
    await closeStaffAuthFixturePools(databaseName, fixtureUrl);
    expect(close).toHaveBeenCalledExactlyOnceWith(fixtureUrl);
  });

  it("rejects same-name fixture on a different PostgreSQL server and invalid URLs", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, symbol, {
      configurable: true,
      value: close,
    });
    await expect(
      closeStaffAuthFixturePools(
        databaseName,
        "postgresql://fixture:secret@127.0.0.1:5432/another",
      ),
    ).rejects.toThrow(/target does not match/);
    await expect(
      closeStaffAuthFixturePools(databaseName, "mysql://example/another"),
    ).rejects.toThrow(/endpoint URL is unsupported/);
    expect(close).not.toHaveBeenCalled();
  });

  it("attests bootstrap, migrator, runtime and every writer to the same host, port and database", () => {
    const admin = "postgresql://admin:secret@127.0.0.1:5432/valet";
    expect(() =>
      assertStaffAuthFixtureEndpoints(
        databaseName,
        fixtureUrl,
        admin,
        fixtureUrl,
        {
          MFA_WRITER_DATABASE_URL: `postgresql://mfa:different@127.0.0.1/${databaseName}`,
        },
      ),
    ).not.toThrow();
    expect(() =>
      assertStaffAuthFixtureEndpoints(
        databaseName,
        fixtureUrl,
        admin,
        fixtureUrl,
        {
          MFA_WRITER_DATABASE_URL: `postgresql://mfa:different@127.0.0.1:65432/${databaseName}`,
        },
      ),
    ).toThrow(/endpoints do not match/);
    expect(() =>
      assertStaffAuthFixtureEndpoints(
        databaseName,
        fixtureUrl,
        "postgresql://admin:secret@127.0.0.1:65432/valet",
        fixtureUrl,
        {},
      ),
    ).toThrow(/endpoints do not match/);
  });

  it("refuses a different bootstrap server before any cleanup opens a database connection", async () => {
    await expect(
      cleanupStaffAuthNativeFixture({
        app: undefined,
        pool: undefined,
        databaseName,
        fixtureDatabaseUrl: fixtureUrl,
        adminDatabaseUrl: "postgresql://admin:masked@127.0.0.1:65432/valet",
        databaseCreated: true,
        writerRoleSnapshots: [],
      }),
    ).rejects.toThrow(/endpoints do not match/);
  });
});
