import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";

import {
  buildIssue429FreshArtifact,
  releaseIssue429FreshArtifact,
} from "./issue429-qa-source-build.mjs";

export function createOwnedSourceFixture() {
  const root = resolve(import.meta.dirname, "../..");
  const tmp = resolve(root, "tmp");
  mkdirSync(tmp, { recursive: true });
  const repo = mkdtempSync(resolve(tmp, "issue429-qa-source-"));
  const apiSrc = join(repo, "apps", "api", "src");
  const contractSrc = join(repo, "packages", "contracts", "src");
  mkdirSync(apiSrc, { recursive: true });
  mkdirSync(contractSrc, { recursive: true });
  writeFileSync(join(repo, ".gitignore"), "dist/\ntmp/\n");
  writeFileSync(join(apiSrc, "main.ts"), "export const source = 'clean';\n");
  writeFileSync(
    join(contractSrc, "index.ts"),
    "export const contract = true;\n",
  );
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: repo,
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
    }).trim();
  git("init", "-q");
  git(
    "add",
    ".gitignore",
    "apps/api/src/main.ts",
    "packages/contracts/src/index.ts",
  );
  git(
    "-c",
    "user.name=Issue429 QA",
    "-c",
    "user.email=issue429-qa@example.invalid",
    "commit",
    "-qm",
    "baseline",
  );
  const sha = git("rev-parse", "HEAD");
  const apiDist = join(repo, "apps", "api", "dist");
  const contractsDist = join(repo, "packages", "contracts", "dist");
  const mockBuild = (packageName, snapshotRoot) => {
    const snapshotApiDist = join(snapshotRoot, "apps", "api", "dist");
    const snapshotContractsDist = join(
      snapshotRoot,
      "packages",
      "contracts",
      "dist",
    );
    if (packageName === "@valet/contracts") {
      mkdirSync(snapshotContractsDist, { recursive: true });
      writeFileSync(
        join(snapshotContractsDist, "index.js"),
        "exports.contract = true;\n",
      );
    } else if (packageName === "@valet/api") {
      mkdirSync(snapshotApiDist, { recursive: true });
      writeFileSync(
        join(snapshotApiDist, "main.js"),
        "exports.source = 'clean';\n",
      );
    } else {
      throw new Error("Unexpected build package.");
    }
  };
  return {
    repo,
    sha,
    apiSrc,
    apiDist,
    contractsDist,
    mockBuild,
    artifact: null,
    build(runBuild = mockBuild) {
      this.artifact = buildIssue429FreshArtifact(sha, repo, {
        runBuild,
        runInstall: () => {},
      });
      return this.artifact;
    },
    close() {
      if (this.artifact) releaseIssue429FreshArtifact(this.artifact, repo);
      const canonical = realpathSync(repo);
      const ownedPrefix = realpathSync(tmp) + sep + "issue429-qa-source-";
      if (
        !canonical.startsWith(ownedPrefix) ||
        canonical === realpathSync(tmp)
      ) {
        throw new Error("Refusing cleanup outside owned Issue429 Git fixture.");
      }
      rmSync(canonical, { recursive: true });
    },
  };
}
