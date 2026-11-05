import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { releaseIssue429SmokeSnapshot } from "./issue429-qa-production-evidence.mjs";

import {
  mayReleaseIssue429RuntimeSnapshot,
  releaseIssue429LeaseAfterChildExits,
  startIssue429TrackedChild,
  trackIssue429OwnedChild,
} from "./issue429-qa-child-lifecycle.mjs";

function fakeChild(onKill) {
  const child = new EventEmitter();
  child.pid = 999_429;
  child.exitCode = null;
  child.signalCode = null;
  child.kills = 0;
  child.kill = () => {
    child.kills += 1;
    onKill?.(child);
    return true;
  };
  return child;
}

test("owned child catches close synchronously emitted from kill (event race)", async () => {
  const child = fakeChild((target) => target.emit("close", null, "SIGTERM"));
  const owner = trackIssue429OwnedChild(child, 20);
  await owner.close();
  assert.equal(owner.exitConfirmed(), true);
  assert.equal(child.kills, 1);
  await owner.close();
  assert.equal(
    child.kills,
    1,
    "Already exited process must not be killed again",
  );
});

test("source snapshot is retained when child exit or PG lease is unconfirmed", () => {
  const safePrelease = {
    leaseAcquired: false,
    leaseReleased: false,
    allChildExitsConfirmed: false,
    cleanupErrors: [],
  };
  assert.equal(
    mayReleaseIssue429RuntimeSnapshot(safePrelease),
    true,
    "Before lease and spawn an unused fresh snapshot can be released.",
  );
  const afterLease = { ...safePrelease, leaseAcquired: true };
  assert.equal(mayReleaseIssue429RuntimeSnapshot(afterLease), false);
  assert.equal(
    mayReleaseIssue429RuntimeSnapshot({ ...afterLease, leaseReleased: true }),
    false,
    "A released lease cannot prove an unconfirmed OS child has exited.",
  );
  assert.equal(
    mayReleaseIssue429RuntimeSnapshot({
      ...afterLease,
      allChildExitsConfirmed: true,
    }),
    false,
    "Confirmed OS exits cannot compensate for a retained exclusive PG lease.",
  );
  assert.equal(
    mayReleaseIssue429RuntimeSnapshot({
      ...afterLease,
      leaseReleased: true,
      allChildExitsConfirmed: true,
      cleanupErrors: ["api-child"],
    }),
    false,
    "Any failed cleanup must retain the runtime snapshot.",
  );
  assert.equal(
    mayReleaseIssue429RuntimeSnapshot({
      ...afterLease,
      leaseReleased: true,
      allChildExitsConfirmed: true,
    }),
    true,
  );
  let releases = 0;
  assert.equal(
    releaseIssue429SmokeSnapshot(afterLease, () => {
      releases += 1;
    }),
    false,
  );
  assert.equal(
    releases,
    0,
    "An unconfirmed child must retain its real runtime files.",
  );
  assert.equal(
    releaseIssue429SmokeSnapshot(
      { ...afterLease, leaseReleased: true, allChildExitsConfirmed: true },
      () => {
        releases += 1;
      },
    ),
    true,
  );
  assert.equal(releases, 1);
});

test("already-exited signal child skips kill after confirmed close", async () => {
  const child = fakeChild();
  const owner = trackIssue429OwnedChild(child, 20);
  child.signalCode = "SIGTERM";
  child.emit("close", null, "SIGTERM");
  await owner.close();
  assert.equal(child.kills, 0);
  assert.equal(owner.exitConfirmed(), true);
});

test("kill acknowledgement without OS close is not sufficient", async () => {
  const child = fakeChild();
  const owner = trackIssue429OwnedChild(child, 15);
  await assert.rejects(owner.close(), /OS exit unconfirmed/);
  assert.equal(owner.exitConfirmed(), false);
  assert.equal(child.kills, 1);
  child.emit("close", null, "SIGTERM");
  await owner.close();
  assert.equal(owner.exitConfirmed(), true);
});

test("startup failure registers owner first and awaits confirmed exit", async () => {
  const child = fakeChild((target) => {
    queueMicrotask(() => target.emit("close", null, "SIGTERM"));
  });
  let registered;
  const order = [];
  await assert.rejects(
    startIssue429TrackedChild(
      child,
      async () => {
        order.push("readiness");
        throw new Error("Startup failed");
      },
      (owner) => {
        order.push("registered");
        registered = owner;
      },
      100,
    ),
    /Startup failed/,
  );
  assert.deepEqual(order, ["registered", "readiness"]);
  assert.equal(registered.exitConfirmed(), true);
  assert.equal(child.kills, 1);
});

test("unconfirmed failed startup retains tracked ownership for lease fence", async () => {
  const child = fakeChild();
  let registered;
  await assert.rejects(
    startIssue429TrackedChild(
      child,
      async () => {
        throw new Error("Not ready");
      },
      (owner) => {
        registered = owner;
      },
      15,
    ),
    /retain exclusive PG lease/,
  );
  assert.ok(registered);
  assert.equal(registered.exitConfirmed(), false);
  assert.equal(child.kills, 1);
});

test("exclusive lease cannot release until every tracked process confirms OS close", async () => {
  let releaseCalls = 0;
  const lease = {
    release: async () => {
      releaseCalls += 1;
    },
  };
  const firstChild = fakeChild();
  const first = trackIssue429OwnedChild(firstChild, 15);
  const secondChild = fakeChild();
  const second = trackIssue429OwnedChild(secondChild, 15);
  await assert.rejects(
    releaseIssue429LeaseAfterChildExits(lease, [first, second]),
    /lease retained/,
  );
  assert.equal(releaseCalls, 0);
  secondChild.emit("close", null, "SIGTERM");
  await assert.rejects(
    releaseIssue429LeaseAfterChildExits(lease, [first, second]),
    /lease retained/,
  );
  assert.equal(releaseCalls, 0);
  firstChild.emit("close", null, "SIGTERM");
  await releaseIssue429LeaseAfterChildExits(lease, [first, second]);
  assert.equal(releaseCalls, 1);
});

test("failed ledger/mock/TLS cleanup prohibits lease release even after OS exit", async () => {
  let releaseCalls = 0;
  const lease = {
    release: async () => {
      releaseCalls += 1;
    },
  };
  const child = fakeChild();
  const owner = trackIssue429OwnedChild(child, 15);
  child.emit("close", null, "SIGTERM");
  for (const failure of ["pg-clients", "https-mock", "tls-fixture"]) {
    await assert.rejects(
      releaseIssue429LeaseAfterChildExits(lease, [owner], [failure]),
      /resource cleanup incomplete/,
    );
  }
  assert.equal(releaseCalls, 0);
  await releaseIssue429LeaseAfterChildExits(lease, [owner], []);
  assert.equal(releaseCalls, 1);
});
