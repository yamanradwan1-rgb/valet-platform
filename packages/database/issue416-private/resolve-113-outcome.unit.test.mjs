import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";

import {
  observeRecovery113,
  RECOVERY_OUTCOME,
  superviseRecovery113,
} from "./resolve-113-outcome.mjs";
import {
  assertOriginalW9DefaultAcls,
  assertOriginalW9RecoveryTarget,
  assertOriginalW9FullHistory,
  W9_ORIGINAL_RECOVERY_TARGET,
} from "./resolve-113-guard.mjs";

const COMMITTED = RECOVERY_OUTCOME.COMMITTED_OBSERVED;
const UNCHANGED = RECOVERY_OUTCOME.UNCHANGED_OBSERVED;
const UNKNOWN = RECOVERY_OUTCOME.UNKNOWN;

function mockAttempt({
  preError = false,
  armError = false,
  childError = false,
  observed = COMMITTED,
  observeError = false,
  recordError = false,
} = {}) {
  const calls = [];
  const options = {
    prepare: async () => {
      calls.push("prepare");
      if (preError) throw new Error("target or SQL guard denied");
    },
    arm: async () => {
      calls.push("arm-fsync");
      if (armError) throw new Error("marker write failed");
    },
    invokeOfficialChild: async () => {
      calls.push("prisma-once");
      if (childError) throw new Error("TIMEOUT: may have committed");
    },
    observe: async () => {
      calls.push("independent-readonly-snapshot");
      if (observeError) throw new Error("readonly connection lost");
      return observed;
    },
    record: async (status, failed) => {
      calls.push(`record:${status}:${failed}`);
      if (recordError) throw new Error("cannot fsync observation");
    },
    release: async () => {
      calls.push("release-lease");
    },
  };
  return { options, calls };
}

test("prechild guard error is NOT_EXECUTED, never arms/launches and releases empty lease", async () => {
  const x = mockAttempt({ preError: true });
  await assert.rejects(superviseRecovery113(x.options), /NOT_EXECUTED/);
  assert.deepEqual(x.calls, ["prepare", "release-lease"]);
});

test("dispatch marker fsync failure retains lease and cannot launch official Prisma", async () => {
  const x = mockAttempt({ armError: true });
  await assert.rejects(superviseRecovery113(x.options), /marker write failed/);
  assert.deepEqual(x.calls, ["prepare", "arm-fsync"]);
});

test("normal child exit plus exact committed readonly postcondition releases lease", async () => {
  const x = mockAttempt();
  assert.equal(await superviseRecovery113(x.options), COMMITTED);
  assert.deepEqual(x.calls, [
    "prepare",
    "arm-fsync",
    "prisma-once",
    "independent-readonly-snapshot",
    `record:${COMMITTED}:false`,
    "release-lease",
  ]);
});

test("failed/timeout child + committed observed is NOT success and retains lease", async () => {
  const x = mockAttempt({ childError: true });
  await assert.rejects(
    superviseRecovery113(x.options),
    /independent read-only review: COMMITTED_OBSERVED/,
  );
  assert.deepEqual(x.calls, [
    "prepare",
    "arm-fsync",
    "prisma-once",
    "independent-readonly-snapshot",
    `record:${COMMITTED}:true`,
  ]);
});

test("failed child + unchanged observed is never called NOT_EXECUTED or auto-retried", async () => {
  const x = mockAttempt({ childError: true, observed: UNCHANGED });
  await assert.rejects(superviseRecovery113(x.options), /UNCHANGED_OBSERVED/);
  assert.deepEqual(x.calls, [
    "prepare",
    "arm-fsync",
    "prisma-once",
    "independent-readonly-snapshot",
    `record:${UNCHANGED}:true`,
  ]);
});

test("child failure plus broken readonly diagnosis records UNKNOWN, holds lease", async () => {
  const x = mockAttempt({ childError: true, observeError: true });
  await assert.rejects(superviseRecovery113(x.options), /UNKNOWN/);
  assert.deepEqual(x.calls, [
    "prepare",
    "arm-fsync",
    "prisma-once",
    "independent-readonly-snapshot",
    `record:${UNKNOWN}:true`,
  ]);
});

test("exit0 but unchanged/different or broken postcondition still pins lease", async () => {
  for (const status of [UNCHANGED, UNKNOWN]) {
    const x = mockAttempt({ observed: status });
    await assert.rejects(
      superviseRecovery113(x.options),
      /independent read-only review/,
    );
    assert.equal(x.calls.includes("release-lease"), false);
    assert.equal(x.calls.filter((c) => c === "prisma-once").length, 1);
  }
});

test("failed durable result recording pins lease even if Prisma exited clean", async () => {
  const x = mockAttempt({ recordError: true });
  await assert.rejects(
    superviseRecovery113(x.options),
    /cannot fsync observation/,
  );
  assert.equal(x.calls.includes("release-lease"), false);
});

test("readonly classifier only calls COMMITTED if exact postcondition is proven", async () => {
  const history = [{ id: "historical" }, { id: "latest", rolledBack: true }];
  const verifyCommitted = (rows) => {
    assert.deepEqual(rows, history);
  };
  const verifyUnchanged = (rows) => {
    assert.deepEqual(rows, [
      { id: "historical" },
      { id: "latest", rolledBack: false },
    ]);
  };
  const classify = (snapshot) =>
    observeRecovery113({
      snapshot,
      assertCommitted: verifyCommitted,
      assertUnchanged: verifyUnchanged,
    });
  assert.equal(await classify(async () => history), COMMITTED);
  assert.equal(
    await classify(async () => [
      { id: "historical" },
      { id: "latest", rolledBack: false },
    ]),
    UNCHANGED,
  );
  assert.equal(
    await classify(async () => [
      { id: "historical", changed: true },
      { id: "latest", rolledBack: true },
    ]),
    UNKNOWN,
  );
  assert.equal(
    await classify(async () => {
      throw Error("auth lost");
    }),
    UNKNOWN,
  );
});

test("production wrapper retains exact official Prisma command, one-shot dispatch and fsynced fence", () => {
  const src = readFileSync(
    new URL("./resolve-113.mjs", import.meta.url),
    "utf8",
  );
  assert.match(
    src,
    /execFileAsync\(process\.execPath, \[invocation\.cli,[\s\S]*?"migrate", "resolve", "--rolled-back", FAILED_113\]/,
  );
  assert.match(src, /timeout: 90_000/);
  assert.match(src, /const handle = await open\(path, "wx", 0o600\)/);
  assert.match(src, /await handle\.sync\(\)/);
  assert.match(src, /snapshot: \(\) => snapshotW9RecoveryState\(env\)/);
  assert.match(src, /isDeepStrictEqual\(current, old\)/);
  assert.match(src, /await rmdir\(leasePath\)/);
  assert.doesNotMatch(src, /migrate", "deploy"|query\(\s*["'`]UPDATE/);
});

test("exact Prime original target, 114-history and default-ACL gates survive before child and after", () => {
  const src = readFileSync(
    new URL("./resolve-113.mjs", import.meta.url),
    "utf8",
  );
  const state = readFileSync(
    new URL("./resolve-113-state.mjs", import.meta.url),
    "utf8",
  );
  assert.match(src, /assertOriginalW9RecoveryTarget\(initialTarget\)/);
  assert.match(
    src,
    /assertOriginalW9RecoveryTarget\(old\.target, initialTarget\)/,
  );
  assert.match(src, /assertOriginalW9FullHistory\(old\.rows\)/);
  assert.match(src, /assertOriginalW9DefaultAcls\(old\.defaultAcls\)/);
  assert.match(
    src,
    /assertOriginalW9RecoveryTarget\(current\.target, initialTarget\)/,
  );
  assert.match(
    src,
    /assertOriginalW9DefaultAcls\(old\.defaultAcls, current\.defaultAcls\)/,
  );
  assert.match(
    src,
    /ISSUE416_W9_RECOVERY_SERVER_STARTED = initialTarget\.serverStarted/,
  );
  assert.match(src, /recovery-child-preflight\.mjs/);
  assert.match(state, /FROM pg_catalog\.pg_default_acl/);
  assert.match(state, /defaultAcls: defaultAcls\.rows/);
  assert.match(state, /target: after/);
  assert.match(src, /assertFailed113Snapshot\(old\.rows, old\.catalog\)/);
  assert.match(
    src,
    /assertResolve113OnlyChangedTarget\(old\.rows, current\.rows\)/,
  );
  assert.match(src, /JSON\.stringify\(old\.memberships\)/);
});

test("Prime W9 attestation and empty default ACLs refuse altered or injected identity", () => {
  const pinned = {
    ...W9_ORIGINAL_RECOVERY_TARGET,
    serverStarted: "2026-11-14T02:00:00.000Z",
  };
  assert.doesNotThrow(() => assertOriginalW9RecoveryTarget(pinned, pinned));
  for (const key of ["containerId", "imageId", "volume", "serverStarted"]) {
    const bad = { ...pinned, [key]: "forged" };
    assert.throws(() => assertOriginalW9RecoveryTarget(bad, pinned));
  }
  assert.doesNotThrow(() => assertOriginalW9DefaultAcls([], []));
  assert.throws(() => assertOriginalW9DefaultAcls([{}]));
  assert.throws(() => assertOriginalW9DefaultAcls([], [{ owner_oid: "123" }]));
  assert.throws(() => assertOriginalW9FullHistory([]));
});
