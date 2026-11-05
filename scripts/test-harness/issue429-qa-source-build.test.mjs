import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync,
  writeFileSync, unlinkSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";

import {
  assertIssue429CleanSource, issue429ArtifactDigest,
} from "./issue429-qa-production-target.mjs";
import {
  buildIssue429FreshArtifact, verifyIssue429FreshArtifact,
} from "./issue429-qa-source-build.mjs";

const root = resolve(import.meta.dirname, "../..");

function createOwnedSourceFixture() {
  const tmp = resolve(root, "tmp");
  mkdirSync(tmp, { recursive: true });
  const repo = mkdtempSync(resolve(tmp, "issue429-qa-source-"));
  const apiSrc = join(repo, "apps", "api", "src");
  const contractSrc = join(repo, "packages", "contracts", "src");
  mkdirSync(apiSrc, { recursive: true });
  mkdirSync(contractSrc, { recursive: true });
  writeFileSync(join(repo, ".gitignore"), "dist/\n");
  writeFileSync(join(apiSrc, "main.ts"), "export const source = 'clean';\n");
  writeFileSync(join(contractSrc, "index.ts"), "export const contract = true;\n");
  const git = (...args) => execFileSync("git", args, {
    cwd: repo, encoding: "utf8", timeout: 10_000, windowsHide: true,
  }).trim();
  git("init", "-q");
  git("add", ".gitignore", "apps/api/src/main.ts", "packages/contracts/src/index.ts");
  git("-c", "user.name=Issue429 QA", "-c",
    "user.email=issue429-qa@example.invalid", "commit", "-qm", "baseline");
  const sha = git("rev-parse", "HEAD");
  const apiDist = join(repo, "apps", "api", "dist");
  const contractsDist = join(repo, "packages", "contracts", "dist");
  const mockBuild = (packageName) => {
    if (packageName === "@valet/contracts") {
      mkdirSync(contractsDist, { recursive: true });
      writeFileSync(join(contractsDist, "index.js"), "exports.contract = true;\n");
    } else if (packageName === "@valet/api") {
      mkdirSync(apiDist, { recursive: true });
      writeFileSync(join(apiDist, "main.js"), "exports.source = 'clean';\n");
    } else {
      throw new Error("Unexpected build package.");
    }
  };
  return {
    repo, sha, apiSrc, apiDist, contractsDist, mockBuild,
    close() {
      const canonical = realpathSync(repo);
      const ownedPrefix = realpathSync(tmp) + sep + "issue429-qa-source-";
      if (!canonical.startsWith(ownedPrefix) ||
          canonical === realpathSync(tmp)) {
        throw new Error("Refusing cleanup outside owned Issue429 Git fixture.");
      }
      rmSync(canonical, { recursive: true });
    },
  };
}

test("historical malicious build and deleted untracked TS cannot be sealed", () => {
  const f = createOwnedSourceFixture();
  try {
    const malicious = join(f.apiSrc, "rogue.ts");
    writeFileSync(malicious, "export const rogue = 'malicious';\n");
    mkdirSync(f.apiDist, { recursive: true });
    writeFileSync(join(f.apiDist, "main.js"), "exports.rogue = 'malicious';\n");
    // Prior build was contaminated; attacker removes source before attestation.
    unlinkSync(malicious);
    const suppliedDigest = issue429ArtifactDigest(f.apiDist);
    assert.equal(assertIssue429CleanSource(f.sha, f.repo), f.sha,
      "Old clean-HEAD-only proof would have accepted the contaminated build.");
    assert.equal(issue429ArtifactDigest(f.apiDist), suppliedDigest);
    assert.throws(() => verifyIssue429FreshArtifact({
      sourceSha: f.sha, repoRoot: f.repo,
      distributionSha256: suppliedDigest,
    }, f.repo), /internally issued fresh build seal/);
    let buildsAttempted = 0;
    assert.throws(() => buildIssue429FreshArtifact(f.sha, f.repo, () => {
      buildsAttempted += 1;
    }), /refuses existing dist/);
    assert.equal(buildsAttempted, 0);
    assert.match(readFileSync(join(f.apiDist, "main.js"), "utf8"), /malicious/,
      "The harness must not delete user-owned prior build artifacts.");
  } finally {
    f.close();
  }
});

test("fresh source build seals only internally produced API and contracts", () => {
  const f = createOwnedSourceFixture();
  try {
    const order = [];
    const artifact = buildIssue429FreshArtifact(f.sha, f.repo, (name) => {
      order.push(name);
      f.mockBuild(name);
    });
    assert.deepEqual(order, ["@valet/contracts", "@valet/api"]);
    assert.equal(verifyIssue429FreshArtifact(artifact, f.repo), artifact);
    assert.equal(artifact.sourceSha, f.sha);
    assert.equal(artifact.distributionPath, join(f.apiDist, "main.js"));
    writeFileSync(join(f.apiDist, "main.js"), "exports.rogue = 'later';\n");
    assert.throws(() => verifyIssue429FreshArtifact(artifact, f.repo),
      /changed after sealing/);
    f.mockBuild("@valet/api");
    writeFileSync(join(f.contractsDist, "index.js"), "exports.rogue = true;\n");
    assert.throws(() => verifyIssue429FreshArtifact(artifact, f.repo),
      /changed after sealing/);
    f.mockBuild("@valet/contracts");
    writeFileSync(join(f.apiSrc, "main.ts"), "export const changed = true;\n");
    assert.throws(() => verifyIssue429FreshArtifact(artifact, f.repo),
      /zero tracked or untracked source changes/);
  } finally {
    f.close();
  }
});

test("failed or incomplete controlled build cannot qualify stale outputs", () => {
  const f = createOwnedSourceFixture();
  try {
    assert.throws(() => buildIssue429FreshArtifact(f.sha, f.repo, () => {
      throw new Error("No local compiler installed");
    }), /No local compiler installed/);
    assert.throws(() => buildIssue429FreshArtifact(f.sha, f.repo, () => {}),
      /did not create its owned output/);
  } finally {
    f.close();
  }
});

test("tracked source changed during controlled build fails before API build", () => {
  const f = createOwnedSourceFixture();
  try {
    const attempted = [];
    assert.throws(() => buildIssue429FreshArtifact(f.sha, f.repo, (name) => {
      attempted.push(name);
      f.mockBuild(name);
      writeFileSync(join(f.apiSrc, "main.ts"),
        "export const injectedDuringBuild = true;\n");
    }), /zero tracked or untracked source changes/);
    assert.deepEqual(attempted, ["@valet/contracts"]);
  } finally {
    f.close();
  }
});

test("untracked or ignored authored source blocks the build before launch", () => {
  const f = createOwnedSourceFixture();
  try {
    const rogue = join(f.apiSrc, "hidden.ts");
    let invocations = 0;
    writeFileSync(rogue, "export const injected = true;\n");
    assert.throws(() => buildIssue429FreshArtifact(f.sha, f.repo, () => {
      invocations += 1;
    }), /zero tracked or untracked source changes/);
    unlinkSync(rogue);
    writeFileSync(join(f.repo, ".git", "info", "exclude"),
      "apps/api/src/hidden.ts\n");
    writeFileSync(rogue, "export const hidden = true;\n");
    assert.throws(() => buildIssue429FreshArtifact(f.sha, f.repo, () => {
      invocations += 1;
    }), /refuses ignored authored source/);
    assert.equal(invocations, 0);
  } finally {
    f.close();
  }
});
