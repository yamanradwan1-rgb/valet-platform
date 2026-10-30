import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  connect: vi.fn(),
  pool: vi.fn(),
}));
vi.mock("pg", () => ({
  Pool: class {
    constructor(config: unknown) {
      boundary.pool(config);
    }
    connect = boundary.connect;
  },
}));

// Load the side-effectful CLI only after environment/mocks are installed.
// Every connection boundary here is mocked; this is not PostgreSQL evidence.
const entrypoint = "../tools/issue336-evidence-summary-pg";
const localUrl = "postgresql://fixture:synthetic@127.0.0.1:6543/vaylet336";

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("ISSUE336_PG_ACK", "ISOLATED_LOCAL_ONLY");
  vi.stubEnv("ISSUE336_PG_URL", localUrl);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("Issue #374 evidence CLI validation ordering", () => {
  it.each([
    {
      name: "missing acknowledgment",
      key: "ISSUE336_PG_ACK",
      value: undefined,
    },
    {
      name: "incorrect acknowledgment",
      key: "ISSUE336_PG_ACK",
      value: "wrong",
    },
    { name: "missing URL", key: "ISSUE336_PG_URL", value: undefined },
    {
      name: "host override",
      key: "ISSUE336_PG_URL",
      value: `${localUrl}?host=synthetic.invalid`,
    },
    {
      name: "database option",
      key: "ISSUE336_PG_URL",
      value: `${localUrl}?database=other`,
    },
    { name: "malformed URL", key: "ISSUE336_PG_URL", value: "invalid" },
  ])(
    "rejects $name before pool or connection initialization",
    async ({ key, value }) => {
      vi.stubEnv(key, value);
      await expect(import(entrypoint)).rejects.toThrow();
      expect(boundary.pool).not.toHaveBeenCalled();
      expect(boundary.connect).not.toHaveBeenCalled();
    },
  );

  it("passes only the validated explicit configuration to the pool", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    boundary.connect.mockRejectedValueOnce(new Error(localUrl));
    await import(entrypoint);
    await vi.waitFor(() => expect(error).toHaveBeenCalledOnce());
    expect(error).toHaveBeenCalledWith(
      "Issue #336 PostgreSQL evidence check failed.",
    );
    expect(boundary.pool).toHaveBeenCalledOnce();
    const config = boundary.pool.mock.calls[0]![0];
    expect(Object.keys(config).sort()).toEqual([
      "database",
      "host",
      "max",
      "password",
      "port",
      "user",
    ]);
    expect([config.host, config.database, config.port, config.max]).toEqual([
      "127.0.0.1",
      "vaylet336",
      6543,
      1,
    ]);
    expect(Object.isFrozen(config)).toBe(true);
    expect(boundary.connect).toHaveBeenCalledOnce();
  });
});
