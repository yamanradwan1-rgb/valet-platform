import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { assertArtifactMatchesDeployment } from "../../apps/customer/scripts/artifact-origin.mjs";
import {
  buildEnvironment,
  pnpmCommand,
  turboBuildArguments,
  validateCustomerReadinessOriginArtifact,
  validateCustomerRewriteArtifact,
  validateCustomerStandaloneArtifact,
  VERIFICATION_API_ORIGIN,
} from "./build-contract.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const outputLimit = 32_000;

test("verification build supplies one deterministic API origin", () => {
  const environment = buildEnvironment("verification", {
    API_ORIGIN: "https://caller.example.test",
    NEXT_PUBLIC_CUSTOMER_APP_ORIGIN: "https://caller-customer.example.test",
    PATH: "example-path",
  });
  assert.equal(environment.API_ORIGIN, VERIFICATION_API_ORIGIN);
  assert.equal(
    Object.hasOwn(environment, "NEXT_PUBLIC_CUSTOMER_APP_ORIGIN"),
    false,
  );
  assert.equal(environment.PATH, "example-path");
  assert.equal(new URL(environment.API_ORIGIN).origin, VERIFICATION_API_ORIGIN);
});

test("production build never fabricates or rewrites API_ORIGIN", () => {
  const missing = buildEnvironment("production", { PATH: "example-path" });
  assert.equal(Object.hasOwn(missing, "API_ORIGIN"), false);

  const valid = "https://api.example.test:8443";
  assert.equal(
    buildEnvironment("production", { API_ORIGIN: valid }).API_ORIGIN,
    valid,
  );

  const invalid = "not a URL";
  assert.equal(
    buildEnvironment("production", { API_ORIGIN: invalid }).API_ORIGIN,
    invalid,
  );
});

test("build orchestration pins Turbo strict environment mode", () => {
  assert.deepEqual(turboBuildArguments(), [
    "turbo",
    "run",
    "build",
    "--env-mode=strict",
  ]);
});

test("Customer startup requires an approved deployment API origin matching its immutable artifact", () => {
  const artifact = "https://api-build.example.test";
  assert.doesNotThrow(() =>
    assertArtifactMatchesDeployment(artifact, artifact),
  );
  assert.doesNotThrow(() =>
    assertArtifactMatchesDeployment(
      "http://127.0.0.1:3911",
      "http://127.0.0.1:3911",
    ),
  );
  assert.throws(
    () =>
      assertArtifactMatchesDeployment(
        artifact,
        "https://api-prod.example.test",
      ),
    /does not match deployment API_ORIGIN/u,
  );
  assert.throws(
    () => assertArtifactMatchesDeployment(artifact, undefined),
    /deployment API_ORIGIN is required/u,
  );
  for (const invalid of [
    "http://api.example.test",
    "https://api.example.test/other",
    "https://username:password@api.example.test",
    "not an origin",
  ]) {
    assert.throws(() => assertArtifactMatchesDeployment(artifact, invalid));
  }
});

test("Customer artifact proves the exact build-time Guest API rewrite", async () => {
  const root = await mkdtemp(join(tmpdir(), "vaylet-customer-artifact-"));
  try {
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, "routes-manifest.json"),
      JSON.stringify({
        rewrites: {
          beforeFiles: [],
          afterFiles: [
            {
              source: "/api/v1/guest/:path*",
              destination: "https://api.example.test/v1/guest/:path*",
            },
          ],
          fallback: [],
        },
      }),
    );
    assert.equal(
      validateCustomerRewriteArtifact({
        customerBuildRoot: root,
        expectedApiOrigin: "https://api.example.test",
      }).destination,
      "https://api.example.test/v1/guest/:path*",
    );
    assert.throws(
      () =>
        validateCustomerRewriteArtifact({
          customerBuildRoot: root,
          expectedApiOrigin: "https://other-api.example.test",
        }),
      /does not match build-time API_ORIGIN/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Customer readiness derives from the immutable standalone Guest rewrite", async () => {
  const root = await mkdtemp(join(tmpdir(), "vaylet-customer-readiness-"));
  try {
    await mkdir(join(root, "static"), { recursive: true });
    await mkdir(join(root, "standalone/apps/customer/.next"), {
      recursive: true,
    });
    await writeFile(
      join(root, "standalone/apps/customer/.next/routes-manifest.json"),
      JSON.stringify({
        rewrites: {
          beforeFiles: [],
          afterFiles: [
            {
              source: "/api/v1/guest/:path*",
              destination: "https://api.example.test/v1/guest/:path*",
            },
          ],
          fallback: [],
        },
      }),
    );
    assert.doesNotThrow(() =>
      validateCustomerReadinessOriginArtifact({
        customerBuildRoot: root,
        expectedApiOrigin: "https://api.example.test",
      }),
    );
    assert.throws(
      () =>
        validateCustomerReadinessOriginArtifact({
          customerBuildRoot: root,
          expectedApiOrigin: "https://other-api.example.test",
        }),
      /does not match build-time API_ORIGIN/u,
    );
    await writeFile(
      join(root, "static", "client.js"),
      "const upstream = 'https://api.example.test';\n",
    );
    assert.throws(
      () =>
        validateCustomerReadinessOriginArtifact({
          customerBuildRoot: root,
          expectedApiOrigin: "https://api.example.test",
        }),
      /leaked into public assets/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Customer standalone artifact contains the production start path and public assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "vaylet-customer-standalone-"));
  try {
    assert.throws(
      () => validateCustomerStandaloneArtifact(root),
      /missing standalone\/apps\/customer\/server\.js/u,
    );
    await mkdir(join(root, "standalone/apps/customer/public"), {
      recursive: true,
    });
    await mkdir(join(root, "standalone/apps/customer/.next/static"), {
      recursive: true,
    });
    await writeFile(
      join(root, "standalone/apps/customer/server.js"),
      "// test\n",
    );
    await writeFile(
      join(root, "standalone/apps/customer/public/sw.js"),
      "// test\n",
    );
    assert.doesNotThrow(() => validateCustomerStandaloneArtifact(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("actual Customer production build rejects missing and invalid API_ORIGIN", async () => {
  await expectCustomerBuildFailure(" ", "API_ORIGIN is required in production");
  await expectCustomerBuildFailure(
    "not a URL",
    "API_ORIGIN must be an absolute HTTP(S) origin",
  );
});

async function expectCustomerBuildFailure(apiOrigin, expectedMessage) {
  const environment = {
    ...process.env,
    API_ORIGIN: apiOrigin,
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "production",
  };
  const command = pnpmCommand(
    ["--filter", "@valet/customer", "exec", "next", "build"],
    environment,
  );
  const result = await run(command, environment);
  assert.notEqual(
    result.code,
    0,
    "Customer production build unexpectedly passed",
  );
  assert.match(result.output, new RegExp(escapeRegExp(expectedMessage), "u"));
}

function run(command, environment) {
  return new Promise((resolvePromise, reject) => {
    let output = "";
    const child = spawn(command.executable, command.args, {
      cwd: repositoryRoot,
      env: environment,
      shell: command.shell,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => {
      output = boundedAppend(output, chunk.toString());
    });
    child.stderr.on("data", (chunk) => {
      output = boundedAppend(output, chunk.toString());
    });
    child.once("error", reject);
    child.once("close", (code) => resolvePromise({ code: code ?? 1, output }));
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function boundedAppend(current, next) {
  const combined = current + next;
  return combined.length <= outputLimit
    ? combined
    : combined.slice(-outputLimit);
}
