import type { PoolConfig } from "pg";

const acknowledgmentError =
  "Issue #336 PostgreSQL check requires explicit isolated local URL.";
const targetError =
  "Refusing a PostgreSQL target outside the isolated local test database.";

/** Pure, tool-specific guard: never forward the input URI to pg for reparsing. */
export function issue336EvidencePoolConfig(
  environment: NodeJS.ProcessEnv = process.env,
): Readonly<PoolConfig> {
  const value = environment.ISSUE336_PG_URL;
  if (environment.ISSUE336_PG_ACK !== "ISOLATED_LOCAL_ONLY" || !value) {
    throw new Error(acknowledgmentError);
  }

  try {
    // Reject normalization ambiguities and the driver's open-ended URI options.
    // Even empty query/fragment delimiters are outside this tool's URL grammar.
    if (
      Array.from(value).some((character) => {
        const code = character.charCodeAt(0);
        return code <= 0x20 || code === 0x7f;
      }) ||
      /%(?![\da-f]{2})/i.test(value) ||
      value.includes("?") ||
      value.includes("#")
    ) {
      throw new Error();
    }
    const target = new URL(value);
    const authority = value.split("://")[1]?.split("/")[0];
    if (
      !["postgres:", "postgresql:"].includes(target.protocol) ||
      target.hostname !== "127.0.0.1" ||
      target.pathname !== "/vaylet336" ||
      authority?.endsWith(":")
    ) {
      throw new Error();
    }

    // pg uses PGPORT when the URI omits a port. Resolve it once, before the
    // pool exists, and pass a validated number so later environment changes
    // cannot redirect the connection to a different local server.
    const portText = target.port || environment.PGPORT || "5432";
    const port = Number(portText);
    if (
      !/^\d+$/.test(portText) ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) {
      throw new Error();
    }

    const user = decodeURIComponent(target.username) || environment.PGUSER;
    const password =
      decodeURIComponent(target.password) || environment.PGPASSWORD;
    return Object.freeze({
      host: "127.0.0.1",
      database: "vaylet336",
      port,
      user,
      password,
      max: 1,
    });
  } catch {
    // URL/decoding errors can retain their credential-bearing input. Replace
    // them without a cause or interpolated value rather than logging them.
    throw new Error(targetError);
  }
}
