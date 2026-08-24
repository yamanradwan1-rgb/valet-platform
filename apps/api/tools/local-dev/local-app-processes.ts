import { spawn, spawnSync, type ChildProcess } from "node:child_process";

export interface ManagedChild {
  readonly child: ChildProcess;
  readonly label: string;
}

export function startManagedProcess(
  label: string,
  command: string,
  args: readonly string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): ManagedChild {
  const child =
    command === process.execPath
      ? spawn(command, [...args], {
          cwd: options.cwd,
          env: options.env ?? process.env,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        })
      : spawn([command, ...args].join(" "), [], {
          cwd: options.cwd,
          env: options.env ?? process.env,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          shell: true,
        });
  pipeTaggedOutput(child, label);
  return { child, label };
}

function pipeTaggedOutput(child: ChildProcess, label: string): void {
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      for (const line of text.split(/\r?\n/)) {
        if (line.trim() !== "") {
          process.stdout.write(`[${label}] ${line}\n`);
        }
      }
    });
  }
}

export function killProcessTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) {
    return;
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

export function stopAllProcesses(children: readonly ManagedChild[]): void {
  for (const managed of children) {
    killProcessTree(managed.child);
  }
}

export function installInterruptHandler(
  children: () => readonly ManagedChild[],
): void {
  const interrupt = (): void => {
    stopAllProcesses(children());
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
}
