// Pure validation only. Never opens PostgreSQL or creates a database.
export function validateDisposableLease(lease, dsnText) {
  if (!lease || typeof lease !== "object" || lease.project !== "issue300" ||
      lease.issuedTo !== "w7" || lease.disposable !== true ||
      typeof lease.leaseId !== "string" ||
      !/^issue300-w7-[a-z0-9-]{8,}$/i.test(lease.leaseId) ||
      typeof lease.runId !== "string" || !lease.runId) {
    throw Error("Missing Prime-issued disposable W7 lease identity");
  }
  if (typeof dsnText !== "string" || !dsnText) {
    throw Error("ISSUE300_PG_DSN missing; no fallback to DATABASE_URL");
  }
  let url;
  try {
    url = new URL(dsnText);
  } catch {
    throw Error("Invalid task-owned PostgreSQL DSN");
  }
  if (!["postgresql:", "postgres:"].includes(url.protocol)) {
    throw Error("Expected PostgreSQL transport");
  }
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw Error("Task-owned local-only PostgreSQL required");
  }
  const port = Number(url.port || "5432");
  if (port === 5432 || port <= 1024 || port > 65535 ||
      lease.port !== port) {
    throw Error("Unverified/non-disposable PostgreSQL port; shared 5432 is forbidden");
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/^issue300_w7_[a-z0-9_]{6,}$/i.test(database) ||
      lease.database !== database ||
      ["valet", "postgres", "template0", "template1"].includes(database.toLowerCase())) {
    throw Error("Database is not uniquely task-owned by Issue #300/W7");
  }
  if (!Number.isSafeInteger(lease.ownerPid) || lease.ownerPid <= 0 ||
      typeof lease.createdBy !== "string" || lease.createdBy !== "prime" ||
      typeof lease.cleanupAuthority !== "string" || !lease.cleanupAuthority) {
    throw Error("Cluster creation and cleanup ownership not documented");
  }
  return Object.freeze({
    database,
    host: url.hostname,
    port,
    leaseId: lease.leaseId,
    runId: lease.runId,
  });
}
