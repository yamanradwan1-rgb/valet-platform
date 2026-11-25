// Only the network/database target participates in test-resource ownership.
// Never include the user, password or raw URL in this identity or errors.
export function postgresEndpointIdentity(connectionString) {
  let url;
  try {
    if (typeof connectionString !== "string") throw new Error("missing");
    url = new URL(connectionString);
  } catch {
    throw new Error("PostgreSQL test endpoint URL is invalid.");
  }
  const port = url.port === "" ? 5432 : Number(url.port);
  let database;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error("PostgreSQL test endpoint URL is unsupported.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !/^[A-Za-z0-9_-]{1,63}$/.test(database) ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("PostgreSQL test endpoint URL is unsupported.");
  }
  const host = url.hostname.toLowerCase();
  return Object.freeze({
    host,
    port,
    database,
    key: `${host}:${port}/${database}`,
  });
}
