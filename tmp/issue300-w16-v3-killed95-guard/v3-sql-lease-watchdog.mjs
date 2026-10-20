// Pure, testable fail-closed SQL lease wrapper. Never creates a DB/connection.
// No operation can return success when the owner lease expires mid-query/transaction.
export const SQL_STATEMENT_TIMEOUT_MS = 15000;
export const SQL_LEASE_MARGIN_MS = 3000;

export function sqlLeaseError(reason) {
  const error = new Error("V3 signed Owner SQL lease rejected: " + reason);
  error.code = "W6_V3_SQL_LEASE_ABORT";
  return error;
}

export function leaseValidUntil(assertCurrentLease, now, expectedId, marginMs) {
  const current = assertCurrentLease();
  if (!current || current.leaseId !== expectedId) {
    throw sqlLeaseError("owner lease changed while connection active");
  }
  const expiry = Date.parse(current.expiresAt);
  const remaining = expiry - now();
  if (!Number.isFinite(expiry) || remaining <= 0 || remaining < marginMs) {
    throw sqlLeaseError("owner lease expired or insufficient SQL time margin");
  }
  return expiry;
}

// start() installs a watchdog BEFORE connect; run(fn) races all callback
// activity against revocation and also checks expiry after fn resolves.
// query() checks the authentic signed lease on EVERY statement, including
// BEGIN/COMMIT/ROLLBACK and parameterized statements.
export function guardedSqlConnection(client, {
  assertCurrentLease,
  leaseId,
  now = Date.now,
  statementTimeoutMs = SQL_STATEMENT_TIMEOUT_MS,
  marginMs = SQL_LEASE_MARGIN_MS,
  tickMs = 100,
  setPoll = setInterval,
  clearPoll = clearInterval,
  // Holder-only: stop the exact owned PG before destroying this lock socket.
  // On unconfirmed stop keep the socket/lock quarantined; still reject SQL.
  quarantineBeforeSocketDestroy,
}) {
  if (!client || typeof client.connect !== "function" ||
      typeof client.query !== "function" || typeof client.end !== "function") {
    throw sqlLeaseError("invalid PostgreSQL connection");
  }
  const queryOriginal = client.query.bind(client);
  let failed = null, active = false, closed = false, closing = false;
  let ticker = null, rejectRevocation, quarantineResult = null;
  const revoked = new Promise((_, reject) => { rejectRevocation = reject; });
  // Make the rejected promise observable even if no in-flight request exists.
  revoked.catch(() => {});
  const verifyCurrent = (margin) =>
    leaseValidUntil(assertCurrentLease, now, leaseId, margin);
  const check = (margin) => {
    if (failed) throw failed;
    // A pending fn can resume even AFTER Promise.race has rejected.
    // Never expose the underlying query function after close/revocation.
    if (closing || closed) throw sqlLeaseError("connection permanently closed");
    return verifyCurrent(margin);
  };
  const fail = (error) => {
    if (failed) return failed;
    failed = error?.code === "W6_V3_SQL_LEASE_ABORT" ? error :
      sqlLeaseError("invalid lease verification during active SQL");
    const destroy = () => {
      try { client.connection?.stream?.destroy?.(); } catch {}
      try { client.end().catch?.(() => {}); } catch {}
    };
    if (quarantineBeforeSocketDestroy) {
      // Do not await from watchdog's timer: revoke query authority NOW.
      // Never destroy holder socket unless independent owned-PG stop is proven.
      quarantineResult = Promise.resolve()
        .then(() => quarantineBeforeSocketDestroy(failed))
        .then(stopped => {
          if (stopped !== true) return false;
          destroy();
          return true;
        })
        .catch(() => false);
    } else destroy();
    rejectRevocation(failed);
    return failed;
  };
  const checkOrAbort = (margin) => {
    try { return check(margin); }
    catch (error) { throw fail(error); }
  };
  client.query = async (...args) => {
    checkOrAbort(statementTimeoutMs + marginMs);
    try {
      const outcome = await Promise.race([queryOriginal(...args), revoked]);
      // An SQL result cannot be trusted after the signer's deadline.
      checkOrAbort(0);
      return outcome;
    } catch (error) {
      if (failed) throw failed;
      throw error;
    }
  };
  const start = async () => {
    if (active) throw sqlLeaseError("connection already initialized");
    active = true;
    checkOrAbort(statementTimeoutMs + marginMs);
    ticker = setPoll(() => {
      if (closed || failed) return;
      // Keep checking signed authority while client.end() is pending.
      try { verifyCurrent(0); } catch (error) { fail(error); }
    }, tickMs);
    try {
      await Promise.race([client.connect(), revoked]);
      checkOrAbort(0);
    } catch (error) { if (failed) throw failed; throw error; }
  };
  const run = async (fn) => {
    if (!active) await start();
    try {
      checkOrAbort(0);
      const result = await Promise.race([Promise.resolve().then(() => fn(client)), revoked]);
      checkOrAbort(0);
      return result;
    } catch (error) {
      if (failed) throw failed;
      throw error;
    }
  };
  const close = async () => {
    if (closed || closing) return;
    closing = true;
    try {
      if (failed) {
        // Connection already destroyed; never issue an expired transaction command.
        return;
      }
      // Keep the active watchdog armed even while closing the connection.
      // A slow end() must not extend transaction authority past expiry.
      await Promise.race([Promise.resolve().then(() => client.end()), revoked]);
      verifyCurrent(0);
    } catch (error) {
      throw fail(error);
    } finally {
      closed = true;
      if (ticker !== null) clearPoll(ticker);
      // Intentionally NEVER restore queryOriginal: an already-rejected
      // Promise.race cannot cancel a suspended fn that may later call COMMIT.
      // The installed query wrapper rejects permanently, including after
      // normal close, timeout, signature swap and socket teardown.
    }
  };
  return { start, run, close, query: (...args) => client.query(...args),
    check: (margin=0) => checkOrAbort(margin),
    get aborted() { return !!failed; },
    get quarantineResult() { return quarantineResult; } };
}
