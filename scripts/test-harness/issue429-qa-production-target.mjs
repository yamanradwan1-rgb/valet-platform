import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, sep } from "node:path";

/** Static fences execute before PostgreSQL lease acquisition or any API spawn. */
export function checkIssue429ProductionInputs(environment, root) {
  if (environment.ISSUE429_QA_EXCLUSIVE_PG17 !== "PRIME_GRANTED_EXCLUSIVE_PG17") {
    throw new Error("Issue429 QA refuses any PG operation without explicit Prime exclusive PG17 authorization.");
  }
  if (environment.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new Error("Issue429 QA refuses disabled certificate verification.");
  }
  if (environment.NODE_ENV === "production") {
    throw new Error("Issue429 QA parent must run outside production.");
  }
  const admin = new URL(environment.TEST_DATABASE_URL ?? "missing");
  const runtime = new URL(environment.ISSUE429_QA_RUNTIME_DATABASE_URL ?? "missing");
  if (![admin, runtime].every((url) =>
    ["postgres:", "postgresql:"].includes(url.protocol) &&
    url.hostname === "127.0.0.1" && url.port === "45432" &&
    url.username && url.password && !url.search && !url.hash)) {
    throw new Error("Issue429 QA requires explicit dedicated loopback PostgreSQL URLs.");
  }
  if (admin.username !== "vaylet_test_admin" || admin.pathname !== "/vaylet_test" ||
      runtime.pathname === admin.pathname ||
      !/^\/issue429_qa_[a-z0-9_]{5,40}$/.test(runtime.pathname) ||
      runtime.username === admin.username) {
    throw new Error("Issue429 QA requires an isolated preprovisioned database and restricted role.");
  }
  if (!environment.ISSUE429_QA_DATABASE_TLS_CA_PEM?.includes("BEGIN CERTIFICATE") ||
      !environment.ISSUE429_QA_EGRESS_POLICY_REF ||
      !environment.ISSUE429_QA_BUILD_SHA?.match(/^[a-f0-9]{40}$/i) ||
      !environment.ISSUE429_QA_ARTIFACT_SHA256?.match(/^[a-f0-9]{64}$/i)) {
    throw new Error("Issue429 QA TLS/egress/build evidence is incomplete.");
  }
  const fixturePath = resolve(environment.ISSUE429_QA_FIXTURE_PATH ?? "");
  const fixtureRoot = resolve(root, "tmp", "issue429-qa");
  if (!fixturePath.startsWith(fixtureRoot + sep) ||
      !existsSync(fixturePath) || !fixturePath.endsWith(".json")) {
    throw new Error("Issue429 QA fixture must be an existing private file under repo tmp/issue429-qa/.");
  }
  return { adminUrl: admin.toString(), runtimeUrl: runtime.toString(), fixturePath };
}

/** Docker check is read-only; PG metadata attestation follows with a read-only query. */
export function inspectIssue429QaDocker() {
  const result = JSON.parse(execFileSync("docker",
    ["inspect", "vaylet-test-postgres"],
    { encoding: "utf8", timeout: 5_000, windowsHide: true, stdio: "pipe" }));
  const own = result?.length === 1 ? result[0] : null;
  const published = own?.NetworkSettings?.Ports?.["5432/tcp"];
  if (own?.Name !== "/vaylet-test-postgres" ||
      !/^postgres:17(?:[.-]|$)/.test(own.Config?.Image ?? "") ||
      own.State?.Status !== "running" ||
      own.Config?.Labels?.["com.docker.compose.project"] !== "vaylet-test" ||
      own.Config?.Labels?.["vaylet.environment"] !== "isolated-test" ||
      !Array.isArray(published) || published.length !== 1 ||
      published[0]?.HostIp !== "127.0.0.1" ||
      published[0]?.HostPort !== "45432" ||
      own.Mounts?.some((mount) => mount.Type === "bind")) {
    throw new Error("Issue429 QA Docker PG17 image/identity/port/ownership mismatch.");
  }
  return { containerId: own.Id, name: own.Name, image: own.Config.Image };
}

export function readIssue429SyntheticActors(path, expectedDatabaseName) {
  const fixture = JSON.parse(readFileSync(path, "utf8"));
  if (fixture.syntheticOnly !== true ||
      fixture.databaseName !== expectedDatabaseName ||
      !Array.isArray(fixture.actors) || fixture.actors.length < 3 ||
      !fixture.accountReadyByOperator) {
    throw new Error("Issue429 QA needs preprovisioned synthetic staff and operator-enabled headroom.");
  }
  for (const actor of fixture.actors) {
    if (![actor.accessToken, actor.organizationId, actor.membershipId,
      actor.locationId].every((value) => typeof value === "string" &&
      value.length > 15)) {
      throw new Error("Issue429 QA fixture contains an incomplete synthetic actor.");
    }
  }
  if (fixture.actors[0].organizationId === fixture.actors[1].organizationId ||
      fixture.actors[0].membershipId === fixture.actors[2].membershipId ||
      fixture.actors[0].organizationId !== fixture.actors[2].organizationId) {
    throw new Error("Issue429 QA needs two tenants and another independently eligible identity.");
  }
  return fixture.actors;
}

export function issue429ArtifactDigest(directory) {
  const hash = createHash("sha256");
  const visit = (folder, relative) => {
    for (const item of readdirSync(folder, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      if (item.isSymbolicLink() || (!item.isDirectory() && !item.isFile())) {
        throw new Error("Production QA build artifact includes unsupported file type.");
      }
      const itemRelative = relative ? `${relative}/${item.name}` : item.name;
      const location = resolve(folder, item.name);
      if (item.isDirectory()) visit(location, itemRelative);
      else {
        hash.update(itemRelative + "\0");
        hash.update(readFileSync(location));
      }
    }
  };
  visit(directory, "");
  return hash.digest("hex");
}

export function assertIssue429ProductionArtifact(buildSha, repoRoot, digest) {
  const dist = resolve(repoRoot, "apps", "api", "dist", "main.js");
  if (!existsSync(dist)) throw new Error("Production API artifact is missing; build before QA.");
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot, encoding: "utf8", windowsHide: true, timeout: 4_000,
  }).trim();
  if (head !== buildSha) throw new Error("Issue429 QA requires a named integrated source build SHA.");
  // Include untracked files: a new authored TS file can be consumed by tsc
  // without appearing in git diff or a tracked-files-only status query.
  const status = execFileSync("git",
    ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: repoRoot, encoding: "utf8", windowsHide: true, timeout: 4_000,
  }).trim();
  if (status) {
    throw new Error("Issue429 QA requires zero tracked or untracked source changes.");
  }
  // Even ignored authored source may be compiled. Restrict this check to the
  // source roots so ignored dependency/build trees cannot hide it or add noise.
  const ignoredSource = execFileSync("git", [
    "ls-files", "--others", "--ignored", "--exclude-standard", "--",
    "apps/api/src", ":(glob)packages/*/src/**",
  ], {
    cwd: repoRoot, encoding: "utf8", windowsHide: true, timeout: 4_000,
  }).split(/\r?\n/).some((path) => /\.(?:ts|tsx|js|mjs|cjs|json)$/.test(path));
  if (ignoredSource) {
    throw new Error("Issue429 QA refuses ignored authored source in production build.");
  }
  const actual = issue429ArtifactDigest(resolve(repoRoot, "apps", "api", "dist"));
  if (actual !== digest) {
    throw new Error("Production API distribution content differs from sealed QA build digest.");
  }
  return { sourceSha: head, distributionPath: dist, distributionSha256: actual };
}
