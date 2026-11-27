import test from "node:test";
import assert from "node:assert/strict";
import { URL } from "node:url";

import {
  P7_IMAGE, P7_OWNER_LABEL, assertOwnedContainer, removeOwnedContainer,
} from "./issue463-browser-proof-docker.mjs";
import {
  P7_FEEDBACK_STAGES, assertFixedRoleContract,
  createP7Credentials, newP7Passwords,
} from "./issue463-browser-proof-bootstrap.mjs";

const owner = "b".repeat(32);
const id = "a".repeat(64);
const candidate = "c".repeat(40);
const database = "issue463_p7_" + owner.slice(0, 12);
const names = Object.freeze({
  sessionLocker: "vaylet_staff_session_lock_owner",
  reader: "vaylet_rating_feedback_reader_owner",
  privacy: "vaylet_rating_feedback_privacy_owner",
  approver: "vaylet_rating_feedback_privacy_approver",
  executor: "vaylet_rating_feedback_privacy_executor",
});
const fixture = () => ({
  Id: id, Name: "/vaylet-issue463-prime-p7-" + owner.slice(0, 12),
  Image: P7_IMAGE, State: { Status: "running" },
  Config: { Labels: { [P7_OWNER_LABEL]: owner, "vaylet.disposable": "true" } },
  HostConfig: {
    RestartPolicy: { Name: "no" }, Binds: null,
    Tmpfs: { "/var/lib/postgresql/data": "rw,size=1g" },
    NetworkMode: "bridge",
  },
  Mounts: [],
  NetworkSettings: { Ports: {
    "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: "57575" }],
  } },
});

test("P7 attests pinned image, exact owner/name, isolated tmpfs and loopback", () => {
  assert.equal(assertOwnedContainer(fixture(), id, owner), 57575);
});

test("P7 refuses wrong Docker image, owner, bind, tmpfs or open host port", () => {
  const mutations = [
    (x) => { x.Image = "sha256:" + "f".repeat(64); },
    (x) => { x.Name = "/some-preexisting-container"; },
    (x) => { x.Config.Labels[P7_OWNER_LABEL] = "wrong-owner"; },
    (x) => { x.Config.Labels["vaylet.disposable"] = "false"; },
    (x) => { x.HostConfig.Binds = ["/host:/var/lib/postgresql/data"]; },
    (x) => { x.HostConfig.Tmpfs = {}; },
    (x) => { x.HostConfig.RestartPolicy.Name = "always"; },
    (x) => { x.Mounts = [{ Type: "volume" }]; },
    (x) => { x.HostConfig.NetworkMode = "host"; },
    (x) => { x.NetworkSettings.Ports["5432/tcp"][0].HostIp = "0.0.0.0"; },
    (x) => { x.NetworkSettings.Ports["5432/tcp"][0].HostPort = "45432"; },
    (x) => { x.State.Status = "exited"; },
  ];
  for (const mutate of mutations) {
    const target = fixture();
    mutate(target);
    assert.throws(() => assertOwnedContainer(target, id, owner));
  }
});

test("P7 refuses W1's outdated privacy actors, accepts W2 canonical actors", () => {
  assert.doesNotThrow(() => assertFixedRoleContract(names));
  assert.throws(() => assertFixedRoleContract({
    ...names, approver: "p0463_privacy_approver",
  }));
  assert.throws(() => assertFixedRoleContract({
    ...names, executor: "p0463_privacy_executor",
  }));
});

test("P7 uses PREPARE before cutover, then P2/P5 and verifies P5 replay", () => {
  assert.deepEqual(P7_FEEDBACK_STAGES, [
    "PREPARE", "P2_TEST", "P5_TEST", "P5_TEST",
  ]);
  assert.equal(P7_FEEDBACK_STAGES.includes("RELEASE"), false);
});

test("P7 cleanup only deletes verified owned id and checks absence", () => {
  const commands = [];
  let deleted = false;
  const invoke = (args) => {
    commands.push(args);
    if (args[0] === "inspect") {
      if (!deleted) return {
        status: 0, stdout: JSON.stringify([fixture()]), stderr: "",
      };
      return { status: 1, stdout: "", stderr: "Error: No such object: " + id };
    }
    if (args[0] === "rm" && args[1] === "-f" && args[2] === id) {
      deleted = true;
      return { status: 0, stdout: id, stderr: "" };
    }
    throw new Error("Unexpected invocation");
  };
  removeOwnedContainer({ id }, owner, invoke);
  assert.equal(deleted, true);
  assert.deepEqual(commands.map((entry) => entry[0]),
    ["inspect", "rm", "inspect"]);
});

test("P7 cleanup refuses a spoofed owner and never invokes rm", () => {
  const commands = [];
  const invoke = (args) => {
    commands.push(args);
    if (args[0] === "inspect") {
      return { status: 0, stdout: JSON.stringify([{
        ...fixture(),
        Config: { Labels: {
          [P7_OWNER_LABEL]: "f".repeat(32),
          "vaylet.disposable": "true",
        } },
      }]), stderr: "" };
    }
    throw new Error("Unsafe deletion attempted");
  };
  assert.throws(() => removeOwnedContainer({ id }, owner, invoke));
  assert.deepEqual(commands.map((entry) => entry[0]), ["inspect"]);
});

test("P7 generates seven distinct loopback URLs and fresh isolated keys", () => {
  const passwords = newP7Passwords();
  const target = { port: 57575, id, candidate, systemId: "1234567890123456789" };
  const { env } = createP7Credentials("C:/synthetic-only", owner, target, database, passwords);
  const urlNames = [
    "MIGRATION_DATABASE_URL", "DATABASE_URL",
    "STAFF_AUTH_WRITER_DATABASE_URL", "MFA_WRITER_DATABASE_URL",
    "MANAGEMENT_WRITER_DATABASE_URL",
    "RATING_FEEDBACK_APPROVER_DATABASE_URL",
    "RATING_FEEDBACK_EXECUTOR_DATABASE_URL",
  ];
  const parsed = urlNames.map((name) => new URL(env[name]));
  assert.equal(new Set(parsed.map((url) => url.username)).size, 7);
  assert.equal(new Set(parsed.map((url) => url.password)).size, 7);
  for (const url of parsed) {
    assert.equal(url.hostname, "127.0.0.1");
    assert.equal(url.port, "57575");
    assert.equal(url.pathname, "/" + database);
    assert.equal(url.search, "");
  }
  assert.equal(env.RATING_FEEDBACK_ATTESTED_SYSTEM_IDENTIFIER, target.systemId);
  assert.equal(env.ISSUE463_P7_CONTAINER, id);
  assert.equal(env.ISSUE463_P7_OWNER, owner);
  assert.equal(env.ISSUE463_P7_CANDIDATE, candidate);
  assert.equal(env.NODE_ENV, "test");
  assert.equal(env.ISSUE463_BROWSER_QA, "I_OWN_DISPOSABLE_463");
  assert.equal(env.RATING_FEEDBACK_INSTALLED, "P5");
  assert.equal(env.OPTION_C_LEGACY_WORKERS_DRAINED, "1");
  for (const key of [
    "ANTI_ABUSE_SQL_PROOF_SECRET_B64URL",
    "ANTI_ABUSE_HMAC_SECRET_B64URL", "MFA_ACTIVITY_PROOF_SECRET_B64URL",
  ]) assert.match(env[key], /^[A-Za-z0-9_-]{43}$/);
  assert.equal(env.NODE_OPTIONS, undefined);
});
