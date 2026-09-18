import { spawn } from "node:child_process";

import {
  buildEnvironment,
  pnpmCommand,
  turboBuildArguments,
} from "./build-contract.mjs";

const [mode, ...extraArguments] = process.argv.slice(2);
const environment = buildEnvironment(mode);
const command = pnpmCommand(turboBuildArguments(extraArguments), environment);
const child = spawn(command.executable, command.args, {
  env: environment,
  shell: command.shell,
  stdio: "inherit",
  windowsHide: true,
});

child.once("error", (error) => {
  console.error(`Build orchestration failed to start: ${error.message}`);
  process.exitCode = 1;
});
child.once("close", (code, signal) => {
  if (signal !== null) {
    console.error(`Build orchestration terminated by signal ${signal}.`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
