import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { issue336EvidencePoolConfig } from "../tools/issue336-evidence-target";

// Inspect the installed parser directly, without a Client, socket or pool.
const requireFromTest = createRequire(__filename);
const DriverParameters = requireFromTest(
  join(dirname(requireFromTest.resolve("pg")), "connection-parameters.js"),
) as new (config: unknown) => {
  host: string;
  database: string;
  port: number;
};

const localUrl = "postgresql://fixture:synthetic@127.0.0.1/vaylet336";
const environment = (url = localUrl): NodeJS.ProcessEnv => ({
  ISSUE336_PG_ACK: "ISOLATED_LOCAL_ONLY",
  ISSUE336_PG_URL: url,
});

afterEach(() => vi.unstubAllEnvs());

describe("Issue #374 offline evidence target safety", () => {
  it.each(["host", "port"] as const)(
    "reproduces the old guard's %s disagreement with the installed driver offline",
    (key) => {
      const value = key === "host" ? "synthetic.invalid" : "6543";
      const url = `${localUrl}?${key}=${value}`;
      const checked = new URL(url);
      expect(checked.hostname).toBe("127.0.0.1");
      expect(checked.pathname).toBe("/vaylet336");
      const effective = new DriverParameters({ connectionString: url });
      expect(effective[key]).toBe(key === "host" ? value : Number(value));
      expect(() => issue336EvidencePoolConfig(environment(url))).toThrow();
    },
  );

  it.each(["postgres", "postgresql"])(
    "preserves a valid %s local URL and the driver's actual destination",
    (protocol) => {
      const config = issue336EvidencePoolConfig(
        environment(localUrl.replace("postgresql:", `${protocol}:`)),
      );
      const effective = new DriverParameters(config);
      expect([effective.host, effective.database, effective.port]).toEqual([
        "127.0.0.1",
        "vaylet336",
        5432,
      ]);
      expect(config.max).toBe(1);
      expect(Object.isFrozen(config)).toBe(true);
      expect(config).not.toHaveProperty("connectionString");
    },
  );

  it("preserves encoded URL credentials without forwarding a connection string", () => {
    const config = issue336EvidencePoolConfig(
      environment(
        "postgresql://fixture%40local:synthetic%3A%40%2F@127.0.0.1:6543/vaylet336",
      ),
    );
    expect(config.user === "fixture@local").toBe(true);
    expect(config.password === "synthetic:@/").toBe(true);
    expect(config.port).toBe(6543);
  });

  it.each([
    { name: "missing acknowledgment", change: { ISSUE336_PG_ACK: undefined } },
    { name: "incorrect acknowledgment", change: { ISSUE336_PG_ACK: "wrong" } },
    { name: "missing URL", change: { ISSUE336_PG_URL: undefined } },
    { name: "empty URL", change: { ISSUE336_PG_URL: "" } },
  ])("rejects $name", ({ change }) => {
    expect(() =>
      issue336EvidencePoolConfig({ ...environment(), ...change }),
    ).toThrow("requires explicit isolated local URL");
  });

  it.each([
    {
      name: "non-loopback host",
      url: localUrl.replace("127.0.0.1", "synthetic.invalid"),
    },
    {
      name: "localhost alias",
      url: localUrl.replace("127.0.0.1", "localhost"),
    },
    { name: "IPv6 loopback", url: localUrl.replace("127.0.0.1", "[::1]") },
    { name: "wrong database", url: localUrl.replace("vaylet336", "other") },
    {
      name: "encoded database",
      url: localUrl.replace("vaylet336", "%76aylet336"),
    },
    { name: "missing database", url: localUrl.replace("/vaylet336", "") },
    { name: "wrong protocol", url: localUrl.replace("postgresql:", "https:") },
    { name: "socket protocol", url: "socket:/tmp/pg?db=vaylet336" },
    { name: "malformed URL", url: "not a connection URL" },
    {
      name: "malformed credential escape",
      url: localUrl.replace("synthetic", "%FF"),
    },
    { name: "incomplete escape", url: localUrl.replace("synthetic", "%2") },
    { name: "leading whitespace", url: ` ${localUrl}` },
    { name: "embedded control", url: localUrl.replace("fixture", "fix\nture") },
    { name: "fragment", url: `${localUrl}#ignored` },
    { name: "empty fragment", url: `${localUrl}#` },
    { name: "empty query", url: `${localUrl}?` },
    {
      name: "empty explicit port",
      url: localUrl.replace("127.0.0.1", "127.0.0.1:"),
    },
    { name: "zero port", url: localUrl.replace("127.0.0.1", "127.0.0.1:0") },
    {
      name: "out-of-range port",
      url: localUrl.replace("127.0.0.1", "127.0.0.1:65536"),
    },
    {
      name: "partial decimal port",
      url: localUrl.replace("127.0.0.1", "127.0.0.1:5432x"),
    },
  ])("fails closed for $name without retaining the input", ({ url }) => {
    let failure: unknown;
    try {
      issue336EvidencePoolConfig(environment(url));
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe(
      "Refusing a PostgreSQL target outside the isolated local test database.",
    );
    expect(failure).not.toHaveProperty("input");
    expect(failure).not.toHaveProperty("cause");
  });

  it.each([
    "host=synthetic.invalid",
    "host=%2Ftmp",
    "hostaddr=192.0.2.1",
    "port=6543",
    "database=other",
    "dbname=other",
    "db=other",
    "service=other",
    "servicefile=synthetic",
    "connectionString=synthetic",
    "h%6fst=synthetic.invalid",
    "host=127.0.0.1&host=synthetic.invalid",
    "sslmode=disable",
  ])("rejects URI option case %# before driver configuration", (query) => {
    expect(() =>
      issue336EvidencePoolConfig(environment(`${localUrl}?${query}`)),
    ).toThrow("Refusing a PostgreSQL target");
  });

  it("pins the validated destination despite hostile or later PG environment values", () => {
    vi.stubEnv("PGHOST", "synthetic.invalid");
    vi.stubEnv("PGDATABASE", "other");
    const config = issue336EvidencePoolConfig({
      ...environment(),
      PGPORT: "6543",
    });
    vi.stubEnv("PGPORT", "6544");
    const effective = new DriverParameters(config);
    expect([effective.host, effective.database, effective.port]).toEqual([
      "127.0.0.1",
      "vaylet336",
      6543,
    ]);
  });

  it("preserves explicit-port precedence and environment credential fallback", () => {
    const config = issue336EvidencePoolConfig({
      ...environment("postgresql://127.0.0.1:6543/vaylet336"),
      PGPORT: "invalid",
      PGUSER: "fixture",
      PGPASSWORD: "synthetic",
    });
    expect(config.port).toBe(6543);
    expect(config.user === "fixture").toBe(true);
    expect(config.password === "synthetic").toBe(true);
  });

  it.each(["0", "65536", "5432x", "-1", "1.5", " 5432", "Infinity"])(
    "rejects invalid effective PGPORT case %#",
    (PGPORT) => {
      expect(() =>
        issue336EvidencePoolConfig({ ...environment(), PGPORT }),
      ).toThrow("Refusing a PostgreSQL target");
    },
  );
});
