import { spawnSync } from "node:child_process";

import { adviseLocalPrecheck } from "./local-precheck-policy.mjs";

function git(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.split("\0").filter(Boolean);
}

function main() {
  const args = process.argv.slice(2);
  const refIndex = args.indexOf("--base");
  if (args.length !== 0 && (args.length !== 2 || refIndex !== 0)) {
    throw new Error(
      "Usage: node scripts/test-harness/local-precheck.mjs [--base origin/main]",
    );
  }
  const base = refIndex >= 0 ? args[1] : "origin/main";
  if (!/^[a-zA-Z0-9_./-]+$/.test(base)) {
    throw new Error(
      "Base must be a plain Git ref name, never a shell command.",
    );
  }
  const changes = [
    ...git(["diff", "--name-only", "-z", `${base}...HEAD`]),
    ...git(["diff", "--name-only", "-z"]),
    ...git(["diff", "--cached", "--name-only", "-z"]),
    ...git(["ls-files", "--others", "--exclude-standard", "-z"]),
  ];
  const plan = adviseLocalPrecheck(changes);
  process.stdout.write(
    JSON.stringify(
      {
        ...plan,
        changedFiles: [...new Set(changes)].sort(),
        disclaimer:
          "LOCAL preview; full required GitHub PR CI is never skipped or reduced.",
      },
      null,
      2,
    ) + "\n",
  );
}

main();
