const packageRoots = Object.freeze({
  "apps/dashboard/": "@valet/dashboard",
  "apps/customer/": "@valet/customer",
  "apps/valet/": "@valet/valet",
  "apps/valet-native/": "@valet/valet-native",
});

function isSensitive(path) {
  return (
    path.startsWith("apps/api/") ||
    path.startsWith("packages/") ||
    path.startsWith(".github/") ||
    path.startsWith("scripts/") ||
    path.startsWith("infra/") ||
    path.startsWith("docs/decisions/") ||
    /^docs\/(?:0[0-9]|1[0-9])_/.test(path) ||
    /(?:AGENTS\.md|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json)$/.test(
      path,
    )
  );
}

function packageOf(path) {
  return Object.entries(packageRoots).find(([prefix]) =>
    path.startsWith(prefix),
  );
}

function quoted(path) {
  if (!/^[a-zA-Z0-9_./-]+$/.test(path))
    throw new Error(`Unsafe local precheck path: ${path}`);
  return path;
}

function defaultPlan(category, reasons) {
  return {
    category,
    reasons,
    commands: ["pnpm test:non-postgres"],
    manualGates: [
      "Review the protected PostgreSQL, browser, Issue215, and security requirements.",
      "Use ONLY an attested disposable PostgreSQL test target for DB-backed local tests.",
    ],
    fullPullRequestCiRequired: true,
  };
}

/**
 * LOCAL preview only. This is a fail-closed developer precheck recommendation,
 * not a dependency graph and never a selector of required PR/merge CI.
 */
export function adviseLocalPrecheck(
  changedFiles,
  { structuralChanges = [] } = {},
) {
  const files = [
    ...new Set(
      changedFiles.map((file) =>
        file.replaceAll("\\", "/").replace(/^\.\//, ""),
      ),
    ),
  ].sort();
  if (structuralChanges.length > 0) {
    return defaultPlan("deleted-or-renamed", [
      "Deletions and renames may remove test ownership or break dependency paths.",
      "Review the original and new paths and run the complete local non-Postgres lane.",
    ]);
  }
  if (files.length === 0) {
    return {
      category: "no-local-changes",
      reasons: [
        "No tracked or untracked differences detected against the supplied base.",
      ],
      commands: [],
      manualGates: [],
      fullPullRequestCiRequired: true,
    };
  }
  if (
    files.some(
      (file) =>
        !file ||
        !/^[a-zA-Z0-9_./-]+$/.test(file) ||
        file.split("/").some((part) => part === "." || part === ".." || !part),
    )
  ) {
    return defaultPlan("untrusted-path", ["Untrusted or out-of-tree input."]);
  }
  if (files.some(isSensitive)) {
    return defaultPlan("protected-or-shared", [
      "API, shared package, runner, migration, security/decision or CI source changed.",
      "Never infer that affected-package unit coverage is sufficient for protected state.",
    ]);
  }
  if (
    files.every(
      (file) =>
        file.startsWith("docs/") &&
        /\.(?:md|mdx|txt)$/.test(file) &&
        !file.startsWith("docs/decisions/"),
    )
  ) {
    return {
      category: "documentation",
      reasons: ["No application code or binding decision source changed."],
      commands: ["pnpm architecture:check"],
      manualGates: [
        "Review references and factual claims; PR CI remains unchanged.",
      ],
      fullPullRequestCiRequired: true,
    };
  }
  const owners = new Map();
  for (const file of files) {
    const owner = packageOf(file);
    if (!owner) {
      return defaultPlan("unknown-impact", [
        `No safe package ownership rule for ${file}.`,
      ]);
    }
    const [prefix, packageName] = owner;
    const relative = file.slice(prefix.length);
    if (
      /\.(?:spec|e2e)\.[cm]?[jt]sx?$/.test(relative) ||
      /\.(?:test|spec)\.[cm]?js$/.test(relative)
    ) {
      return defaultPlan("uncertain-test-runner", [
        `Browser/Node test extension requires explicit runner: ${file}.`,
      ]);
    }
    if (!relative.startsWith("src/") && !relative.startsWith("test/")) {
      return defaultPlan("runtime-or-configuration-impact", [
        `Browser, Native, or package config needs explicit manual suite selection: ${file}.`,
      ]);
    }
    const existing = owners.get(packageName) ?? [];
    existing.push(relative);
    owners.set(packageName, existing);
  }
  if (owners.size > 2) {
    return defaultPlan("multi-package-impact", [
      "More than two application packages changed: use the complete local non-Postgres lane.",
    ]);
  }
  const commands = [];
  for (const [pkg, sources] of owners) {
    commands.push(`pnpm --filter ${pkg} typecheck`);
    const testFiles = sources.filter((file) => /\.test\.[jt]sx?$/.test(file));
    const regularSources = sources.filter(
      (file) => /\.[cm]?[jt]sx?$/.test(file) && !testFiles.includes(file),
    );
    if (testFiles.length > 0 && testFiles.length === sources.length) {
      commands.push(
        `pnpm --filter ${pkg} exec vitest run ${testFiles.map(quoted).join(" ")}`,
      );
    } else if (
      regularSources.length > 0 &&
      regularSources.length === sources.length
    ) {
      commands.push(
        `pnpm --filter ${pkg} exec vitest related --run ${regularSources.map(quoted).join(" ")}`,
      );
      commands.push(`pnpm --filter ${pkg} test`);
    } else {
      commands.push(`pnpm --filter ${pkg} test`);
    }
  }
  return {
    category: "application-local",
    reasons: [
      "Local package checks only, not a sound dependency-impact proof.",
      "Vitest related misses dynamic-import and runtime-discovered dependencies.",
    ],
    commands,
    manualGates: [
      "Review feature-specific negative, browser, and exact authorization cases.",
      "All required PostgreSQL and E2E gates still run in the existing PR workflow.",
    ],
    fullPullRequestCiRequired: true,
  };
}
