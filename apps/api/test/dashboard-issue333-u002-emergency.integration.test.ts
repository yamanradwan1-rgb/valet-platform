import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  fixture,
  startIssue333Lab,
  stopIssue333Lab,
} from "./dashboard-issue333-lab";
import {
  controlledDisable,
  OwnedPeer,
} from "./issue333-u002-emergency-harness";
import {
  actor,
  fetchProtected,
  holdUserSecurity,
  persistentWitness,
  waitForQueuedAdvisory,
} from "./issue333-u002-emergency-witness";

const peers: OwnedPeer[] = [];

beforeAll(startIssue333Lab, 180_000);
afterAll(async () => {
  try {
    for (const peer of peers.reverse()) await peer.stop();
  } finally {
    await stopIssue333Lab();
  }
}, 90_000);

describe("#333 U-002 independent Nest processes and canonical emergency disable", () => {
  it("witnesses reader-first, emergency-first, slow delivery, disconnect and lost success ACK", async () => {
    const first = await actor(`ISSUE333-EMERGENCY-A-${randomUUID()}`);
    const reader = new OwnedPeer(fixture.runtimeDatabaseUrl(), "held", true);
    const fresh = new OwnedPeer(fixture.runtimeDatabaseUrl(), "fresh", false);
    peers.push(reader, fresh);
    const [readerReady, freshReady] = await Promise.all([
      reader.wait("ready", 35_000),
      fresh.wait("ready", 35_000),
    ]);
    expect(reader.pid).not.toBe(fresh.pid);
    const readerBase = readerReady.baseUrl!;
    const freshBase = freshReady.baseUrl!;
    const baseline = await fetchProtected(
      freshBase,
      first.path,
      first.auth.accessToken,
      "baseline",
    );
    expect(baseline.status).toBe(200);
    expect(baseline.body).toContain(first.location.name);

    const held = reader.wait("sql-completed-http-held", 20_000, "held");
    const pending = fetchProtected(
      readerBase,
      first.path,
      first.auth.accessToken,
      "reader-first",
    );
    const entered = await held;
    expect(entered.pid).toBe(reader.pid);
    // The real SQL transaction ended. Hold the actual Nest response before serialization.
    await new Promise((done) => setTimeout(done, 250));
    const operationId = randomUUID();
    const startedAt = new Date().toISOString();
    const operation = controlledDisable(
      first.user.id,
      operationId,
      fixture.migrationDatabaseUrl(),
    );
    const cli = await operation.result;
    const witness = await persistentWitness(
      first.user.id,
      first.auth.sessionId,
      operationId,
    );
    const beforeRelease = new Date().toISOString();
    const finishPromise = reader.wait("http-finish", 15_000, "reader-first");
    reader.release("held");
    const [result, delivered] = await Promise.all([pending, finishPromise]);
    const after = await fetchProtected(
      freshBase,
      first.path,
      first.auth.accessToken,
      "emergency-first",
    );
    const newAdmissionFinish = await fresh.wait(
      "http-finish",
      10_000,
      "emergency-first",
    );
    const retry = controlledDisable(
      first.user.id,
      operationId,
      fixture.migrationDatabaseUrl(),
    );
    const retryExit = await retry.result;
    const replay = await persistentWitness(
      first.user.id,
      first.auth.sessionId,
      operationId,
    );

    const second = await actor(`ISSUE333-EMERGENCY-DISCONNECT-${randomUUID()}`);
    const disconnect = new AbortController();
    const secondGate = reader.wait("sql-completed-http-held", 20_000, "held");
    const aborted = fetchProtected(
      readerBase,
      second.path,
      second.auth.accessToken,
      "disconnect",
      disconnect.signal,
    ).catch((error: unknown) =>
      error instanceof Error ? error.name : "unknown",
    );
    await secondGate;
    const closePromise = reader.wait("http-close", 10_000, "disconnect");
    disconnect.abort();
    const abortedResult = await aborted;
    const closed = await closePromise;
    const secondOperationId = randomUUID();
    const secondCli = await controlledDisable(
      second.user.id,
      secondOperationId,
      fixture.migrationDatabaseUrl(),
    ).result;
    const secondWitness = await persistentWitness(
      second.user.id,
      second.auth.sessionId,
      secondOperationId,
    );
    reader.release("held");
    const noFinish = await reader.wait("http-finish", 500, "disconnect").then(
      () => false,
      () => true,
    );

    // Admission queued after a security writer requests the same real PG lock.
    const third = await actor(`ISSUE333-EMERGENCY-QUEUED-${randomUUID()}`);
    const lockHolder = await holdUserSecurity(third.user.id);
    let queued: { pid: number; blockers: number[] }[] = [];
    let queuedResponse: { status: number; body: string };
    let queuedExit: { pid: number; exitedAt: string };
    const thirdOperationId = randomUUID();
    const thirdCommand = controlledDisable(
      third.user.id,
      thirdOperationId,
      fixture.migrationDatabaseUrl(),
    );
    try {
      const writerQueued = await waitForQueuedAdvisory(1, lockHolder.key);
      expect(writerQueued[0]?.blockers).toContain(lockHolder.holderPid);
      const incoming = fetchProtected(
        freshBase,
        third.path,
        third.auth.accessToken,
        "queued-admission",
      );
      const bothQueued = await waitForQueuedAdvisory(2, lockHolder.key);
      expect(
        bothQueued.some(
          (row) =>
            row.pid !== writerQueued[0]!.pid &&
            (row.blockers.includes(writerQueued[0]!.pid) ||
              row.blockers.includes(lockHolder.holderPid)),
        ),
      ).toBe(true);
      queued = [...writerQueued, ...bothQueued];
      await lockHolder.client.query("COMMIT");
      queuedExit = await thirdCommand.result;
      queuedResponse = await incoming;
    } finally {
      await lockHolder.client.query("ROLLBACK").catch(() => undefined);
      lockHolder.client.release();
      await thirdCommand.result.catch(() => undefined);
    }
    const thirdWitness = await persistentWitness(
      third.user.id,
      third.auth.sessionId,
      thirdOperationId,
    );

    const evidence = {
      apiPids: [reader.pid, fresh.pid],
      commandPids: [cli.pid, retryExit.pid, secondCli.pid],
      postgres: {
        port: witness.pg_port,
        db: witness.database,
        version: witness.pg_version,
        witnessBackendPid: witness.db_pid,
      },
      readerFirst: {
        gateAt: entered.at,
        cliStartedAt: startedAt,
        cliExitedAt: cli.exitedAt,
        persistedBeforeReleaseAt: beforeRelease,
        finishAt: delivered.at,
        status: result.status,
        privateLocationSent: result.body.includes(first.location.name),
      },
      emergencyFirst: {
        status: after.status,
        finishAt: newAdmissionFinish.at,
        privateLocationSent: after.body.includes(first.location.name),
      },
      lostConsumerAckRetry: {
        retryExitedAt: retryExit.exitedAt,
        auditCount: replay.audits,
        disabled: replay.status === "DISABLED",
      },
      disconnected: {
        abortedResult,
        closeAt: closed.at,
        closeFinished: closed.finished,
        laterFinish: !noFinish,
        disableExitedAt: secondCli.exitedAt,
        disabled: secondWitness.status === "DISABLED",
      },
      queuedAdmission: {
        holderPgPid: lockHolder.holderPid,
        key: lockHolder.key,
        advisoryWaiters: queued,
        commandPid: queuedExit.pid,
        commandExitedAt: queuedExit.exitedAt,
        status: queuedResponse.status,
        privateLocationSent: queuedResponse.body.includes(third.location.name),
        disabled: thirdWitness.status === "DISABLED",
      },
    };
    console.log("ISSUE333_U002_EMERGENCY_EVIDENCE", JSON.stringify(evidence));

    expect(witness.pg_version).toBeGreaterThanOrEqual(170000);
    expect(witness.pg_version).toBeLessThan(180000);
    expect(newAdmissionFinish.finished).toBe(true);
    expect(after.status).not.toBe(200);
    expect(after.body).not.toContain(first.location.name);
    expect(closed.finished).toBe(false);
    expect(noFinish).toBe(true);
    expect(queuedResponse.status).not.toBe(200);
    expect(queuedResponse.body).not.toContain(third.location.name);
    expect(result.body).not.toContain(first.location.name); // Expected RED if old reply leaks.
    expect(result.status).not.toBe(200);
  }, 120_000);
});
