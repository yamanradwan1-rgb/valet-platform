import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  assertIssue429CleanSource,
  issue429ArtifactDigest,
} from "./issue429-qa-production-target.mjs";
import {
  buildIssue429FreshArtifact,
  verifyIssue429FreshArtifact,
} from "./issue429-qa-source-build.mjs";
import { createOwnedSourceFixture } from "./issue429-qa-source-fixture.mjs";

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
    assert.equal(
      assertIssue429CleanSource(f.sha, f.repo),
      f.sha,
      "Old clean-HEAD-only proof would have accepted the contaminated build.",
    );
    assert.equal(issue429ArtifactDigest(f.apiDist), suppliedDigest);
    assert.throws(
      () =>
        verifyIssue429FreshArtifact(
          {
            sourceSha: f.sha,
            repoRoot: f.repo,
            distributionSha256: suppliedDigest,
          },
          f.repo,
        ),
      /internally issued fresh build seal/,
    );
    const artifact = f.build();
    assert.notEqual(
      artifact.distributionPath,
      join(f.apiDist, "main.js"),
      "A previously contaminated original output is never the smoke runtime.",
    );
    assert.match(readFileSync(artifact.distributionPath, "utf8"), /clean/);
    assert.equal(verifyIssue429FreshArtifact(artifact, f.repo), artifact);
    assert.match(
      readFileSync(join(f.apiDist, "main.js"), "utf8"),
      /malicious/,
      "The harness must not delete user-owned prior build artifacts.",
    );
  } finally {
    f.close();
  }
});

test("fresh source build seals only internally produced API and contracts", () => {
  const f = createOwnedSourceFixture();
  try {
    const order = [];
    const artifact = f.build((name, snapshotRoot) => {
      order.push(name);
      f.mockBuild(name, snapshotRoot);
    });
    assert.deepEqual(order, ["@valet/contracts", "@valet/api"]);
    assert.equal(verifyIssue429FreshArtifact(artifact, f.repo), artifact);
    assert.equal(artifact.sourceSha, f.sha);
    assert.equal(
      artifact.distributionPath,
      join(artifact.buildRoot, "apps", "api", "dist", "main.js"),
    );
    chmodSync(artifact.distributionPath, 0o666);
    writeFileSync(artifact.distributionPath, "exports.rogue = 'later';\n");
    assert.throws(
      () => verifyIssue429FreshArtifact(artifact, f.repo),
      /changed after sealing/,
    );
    f.mockBuild("@valet/api", artifact.buildRoot);
    const contractsEntry = join(
      artifact.buildRoot,
      "packages",
      "contracts",
      "dist",
      "index.js",
    );
    chmodSync(contractsEntry, 0o666);
    writeFileSync(contractsEntry, "exports.rogue = true;\n");
    assert.throws(
      () => verifyIssue429FreshArtifact(artifact, f.repo),
      /changed after sealing/,
    );
    f.mockBuild("@valet/contracts", artifact.buildRoot);
    writeFileSync(join(f.apiSrc, "main.ts"), "export const changed = true;\n");
    assert.throws(
      () => verifyIssue429FreshArtifact(artifact, f.repo),
      /zero tracked or untracked source changes/,
    );
  } finally {
    f.close();
  }
});

test("failed or incomplete controlled build cannot qualify stale outputs", () => {
  const f = createOwnedSourceFixture();
  try {
    assert.throws(
      () =>
        buildIssue429FreshArtifact(f.sha, f.repo, {
          runBuild: () => {
            throw new Error("No local compiler installed");
          },
          runInstall: () => {},
        }),
      /No local compiler installed/,
    );
    assert.throws(
      () =>
        buildIssue429FreshArtifact(f.sha, f.repo, {
          runBuild: () => {},
          runInstall: () => {},
        }),
      /did not create its owned output/,
    );
  } finally {
    f.close();
  }
});

test("tracked source changed during controlled build fails before API build", () => {
  const f = createOwnedSourceFixture();
  try {
    const attempted = [];
    assert.throws(
      () =>
        buildIssue429FreshArtifact(f.sha, f.repo, {
          runBuild: (name, snapshotRoot) => {
            attempted.push(name);
            f.mockBuild(name, snapshotRoot);
            writeFileSync(
              join(f.apiSrc, "main.ts"),
              "export const injectedDuringBuild = true;\n",
            );
          },
          runInstall: () => {},
        }),
      /zero tracked or untracked source changes/,
    );
    assert.deepEqual(attempted, ["@valet/contracts"]);
  } finally {
    f.close();
  }
});

test("temporary live-worktree injection during compilation cannot enter snapshot", () => {
  const f = createOwnedSourceFixture();
  try {
    const invoked = [];
    const artifact = f.build((name, snapshotRoot) => {
      const malicious = join(f.apiSrc, "transient-rogue.ts");
      writeFileSync(malicious, "export const injected = 'during compiler';\n");
      try {
        assert.equal(
          existsSync(
            join(snapshotRoot, "apps", "api", "src", "transient-rogue.ts"),
          ),
          false,
          "Compiler must read only immutable tracked Git blobs in the checkout.",
        );
        f.mockBuild(name, snapshotRoot);
        invoked.push(name);
      } finally {
        unlinkSync(malicious);
      }
    });
    assert.deepEqual(invoked, ["@valet/contracts", "@valet/api"]);
    assert.equal(verifyIssue429FreshArtifact(artifact, f.repo), artifact);
    assert.match(readFileSync(artifact.distributionPath, "utf8"), /clean/);
    assert.equal(existsSync(join(f.apiSrc, "transient-rogue.ts")), false);
  } finally {
    f.close();
  }
});

test("private snapshot checkout cannot invoke an inherited Git post-checkout hook", () => {
  const f = createOwnedSourceFixture();
  try {
    const hook = join(f.repo, ".git", "hooks", "post-checkout");
    writeFileSync(hook, "#!/bin/sh\nexit 42\n");
    chmodSync(hook, 0o755);
    assert.equal(
      verifyIssue429FreshArtifact(f.build(), f.repo).sourceSha,
      f.sha,
    );
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
    assert.throws(
      () =>
        buildIssue429FreshArtifact(f.sha, f.repo, {
          runBuild: () => {
            invocations += 1;
          },
          runInstall: () => {},
        }),
      /zero tracked or untracked source changes/,
    );
    unlinkSync(rogue);
    writeFileSync(
      join(f.repo, ".git", "info", "exclude"),
      "apps/api/src/hidden.ts\n",
    );
    writeFileSync(rogue, "export const hidden = true;\n");
    assert.throws(
      () =>
        buildIssue429FreshArtifact(f.sha, f.repo, {
          runBuild: () => {
            invocations += 1;
          },
          runInstall: () => {},
        }),
      /refuses ignored authored source/,
    );
    assert.equal(invocations, 0);
  } finally {
    f.close();
  }
});
