import { expect, vi } from "vitest";
import * as contactAuthorization from "../src/modules/management/management-visit-contact-authorization";
import type { ManagementVisitContactTestFixture } from "./management-visit-contact-test-fixture";
interface Scenario {
  readonly adminToken: string;
  readonly grantedA: string;
  readonly lmMembershipId: string;
  readonly lmToken: string;
  readonly organizationId: string;
}

interface ReaderTxRow {
  readonly pid: number;
  readonly isolation: string;
  readonly snapshot: string;
  readonly blockers: number[];
}

function latch() {
  let release!: () => void;
  const promise = new Promise<void>((done) => {
    release = done;
  });
  return { promise, release };
}

async function bounded<T>(operation: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`W4 ${label} exceeded 5s`)),
          5_000,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function raceWithCanonicalRevoke(
  fixture: ManagementVisitContactTestFixture,
  s: Scenario,
  path: string,
  privateMarker: string,
  inspect?: (previousBody: string, freshBody: string) => void,
) {
  const authorized = latch();
  const resume = latch();
  const original = contactAuthorization.authorizeVisitContactRead;
  const readerStarted = performance.now();
  let readerTx: ReaderTxRow | undefined;
  vi.spyOn(
    contactAuthorization,
    "authorizeVisitContactRead",
  ).mockImplementation(async (...args) => {
    const viewer = await original(...args);
    if (viewer.membershipId === s.lmMembershipId) {
      const proof = await args[0].query<ReaderTxRow>(
        `SELECT pg_backend_pid()::int AS pid,
                  current_setting('transaction_isolation') AS isolation,
                  pg_current_snapshot()::text AS snapshot,
                  pg_blocking_pids(pg_backend_pid()) AS blockers`,
      );
      readerTx = proof.rows[0];
      authorized.release();
      await resume.promise;
    }
    return viewer;
  });

  const pending = fixture.managementGet(path, s.lmToken);
  let revokeStatus = 0;
  let previous: Awaited<typeof pending> | undefined;
  let writer: ReturnType<typeof fixture.managementPost> | undefined;
  let failure: unknown;
  let writerStarted = 0;
  let writerFinished = 0;
  let grantCountAfterCommit = "unverified";
  try {
    await bounded(authorized.promise, "authorization gate");
    const membership = await fixture.query<{ version: number }>(
      "SELECT version FROM organization_memberships WHERE id=$1",
      [s.lmMembershipId],
    );
    writerStarted = performance.now();
    writer = fixture.managementPost(
      `/v1/staff/management/organizations/${s.organizationId}/staff/${s.lmMembershipId}/location-access/revoke`,
      s.adminToken,
      {
        expectedVersion: membership.rows[0]!.version,
        locationIds: [s.grantedA],
      },
    );
    const revoke = await bounded(writer, "canonical HTTP writer");
    writerFinished = performance.now();
    revokeStatus = revoke.status;
    expect(revoke.status).toBe(201);
    const current = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM membership_location_access
       WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3`,
      [s.organizationId, s.lmMembershipId, s.grantedA],
    );
    expect(current.rows[0]?.count).toBe("0");
    grantCountAfterCommit = current.rows[0]?.count ?? "missing";
  } catch (error) {
    failure = error;
  } finally {
    resume.release();
    try {
      previous = await bounded(pending, "HTTP reader drain");
    } catch (error) {
      if (failure === undefined) failure = error;
    }
    if (writer !== undefined) {
      try {
        await bounded(writer, "canonical writer drain");
      } catch (error) {
        if (failure === undefined) failure = error;
      }
    }
  }
  vi.restoreAllMocks();
  if (failure !== undefined) throw failure;
  if (previous === undefined)
    throw new Error("W4 reader completed without HTTP response.");
  const readerFinished = performance.now();
  const freshStarted = performance.now();
  const fresh = await fixture.managementGet(path, s.lmToken);
  const freshFinished = performance.now();
  const previousBody = JSON.stringify(previous.body);
  const freshBody = JSON.stringify(fresh.body);
  const staleDisclosure = previousBody.includes(privateMarker);
  console.log(
    "ISSUE333_W4_CANONICAL_RACE",
    JSON.stringify({
      pathKind: path.includes("visit-vehicles")
        ? "VEHICLE_HISTORY"
        : path.includes("/visits")
          ? "CUSTOMER_HISTORY"
          : "CONTACT_SEARCH",
      revokeStatus,
      grantCountAfterCommit,
      previousStatus: previous.status,
      freshStatus: fresh.status,
      readerTx,
      readerMs: Math.round(readerFinished - readerStarted),
      writerMs: Math.round(writerFinished - writerStarted),
      freshMs: Math.round(freshFinished - freshStarted),
      staleDisclosure,
      freshDisclosure: freshBody.includes(privateMarker),
    }),
  );
  inspect?.(previousBody, freshBody);
  expect(freshBody).not.toContain(privateMarker);
  // Security invariant: the completed canonical revocation precedes the protected SQL projection.
  expect(previousBody).not.toContain(privateMarker);
}
