import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildEnvironment,
  pnpmCommand,
  turboBuildArguments,
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
