import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export interface PeerEvent {
  readonly event: string;
  readonly trace?: string;
  readonly baseUrl?: string;
  readonly status?: number;
  readonly finished?: boolean;
  readonly pid?: number;
  readonly at?: string;
  readonly cause?: string;
}

const script = resolve(process.cwd(), "test/issue333-u002-emergency-peer.ts");
const live = new Set<ChildProcess>();

export class OwnedPeer {
  readonly child: ChildProcess;
  readonly pid: number;
  private readonly queue: PeerEvent[] = [];
  private readonly waiters: Array<{
    wanted: string;
    trace: string | undefined;
    done: (value: PeerEvent) => void;
  }> = [];
  private diagnostic = "";

  constructor(runtimeUrl: string, trace: string, hold: boolean) {
    const required = [
      "dist/app.module.js",
      "dist/modules/dashboard/dashboard-scope-discovery.service.js",
      "../../packages/contracts/dist/index.js",
    ];
    if (required.some((file) => !existsSync(resolve(process.cwd(), file)))) {
      throw new Error(
        "Owned API peers require compiled API and contracts artifacts.",
      );
    }
    this.child = spawn(process.execPath, ["--import", "tsx", script], {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_URL: runtimeUrl,
        ISSUE333_U002_HOLD_READER: String(hold),
        ISSUE333_U002_TRACE: trace,
      },
    });
    if (
      !this.child.pid ||
      this.child.spawnfile !== process.execPath ||
      !this.child.spawnargs.includes(script)
    )
      throw new Error("Unattested API child process.");
    this.pid = this.child.pid;
    live.add(this.child);
    this.child.once("exit", () => live.delete(this.child));
    this.child.on("message", (value: PeerEvent) => {
      const index = this.waiters.findIndex(
        (waiting) =>
          waiting.wanted === value.event &&
          (waiting.trace === undefined || waiting.trace === value.trace),
      );
      if (index >= 0) this.waiters.splice(index, 1)[0]!.done(value);
      else this.queue.push(value);
    });
    const collect = (chunk: Buffer) => {
      this.diagnostic = (this.diagnostic + chunk.toString())
        .replaceAll(runtimeUrl, "[DATABASE]")
        .replace(/postgres(?:ql)?:\/\/\S+/gi, "[DATABASE]")
        .slice(-500);
    };
    this.child.stderr?.on("data", collect);
    this.child.stdout?.on("data", collect);
  }

  wait(wanted: string, timeoutMs = 15_000, trace?: string): Promise<PeerEvent> {
    return new Promise((done, fail) => {
      const found = this.queue.findIndex(
        (value) =>
          value.event === wanted &&
          (trace === undefined || value.trace === trace),
      );
      if (found >= 0) {
        done(this.queue.splice(found, 1)[0]!);
        return;
      }
      const waiting = {
        wanted,
        trace,
        done: (value: PeerEvent) => complete(undefined, value),
      };
      const timer = setTimeout(
        () =>
          complete(
            new Error(`Peer ${this.pid} missing ${wanted}: ${this.diagnostic}`),
          ),
        timeoutMs,
      );
      const onExit = () =>
        complete(
          new Error(
            `Peer ${this.pid} exited before ${wanted}: ${this.diagnostic}`,
          ),
        );
      const complete = (error?: Error, value?: PeerEvent) => {
        clearTimeout(timer);
        this.child.off("exit", onExit);
        const index = this.waiters.indexOf(waiting);
        if (index >= 0) this.waiters.splice(index, 1);
        if (error) fail(error);
        else done(value!);
      };
      this.waiters.push(waiting);
      this.child.once("exit", onExit);
    });
  }

  release(trace: string): void {
    this.child.send({ action: "release", trace });
  }

  async stop(): Promise<void> {
    if (
      !live.has(this.child) ||
      this.child.spawnfile !== process.execPath ||
      !this.child.spawnargs.includes(script)
    )
      return;
    await new Promise<void>((done, fail) => {
      const timer = setTimeout(
        () => fail(new Error(`Owned child ${this.pid} did not terminate.`)),
        10_000,
      );
      this.child.once("exit", () => {
        clearTimeout(timer);
        done();
      });
      if (!this.child.kill()) {
        clearTimeout(timer);
        fail(new Error(`Owned child ${this.pid} refused termination.`));
      }
    });
  }
}

export function controlledDisable(
  userId: string,
  operationId: string,
  migrationUrl: string,
) {
  const args = [
    "--import",
    "tsx",
    "tools/security-disable-staff.ts",
    "--operation",
    "disable-user",
    "--operation-id",
    operationId,
    "--operator-ref",
    "issue333-u002-owned-lab",
    "--user-id",
    userId,
  ];
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: "test",
      MIGRATION_DATABASE_URL: migrationUrl,
    },
  });
  if (!child.pid || child.spawnfile !== process.execPath)
    throw new Error("Unattested controlled security CLI child process.");
  const pid = child.pid;
  const result = new Promise<{ pid: number; exitedAt: string }>(
    (done, fail) => {
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString())
          .replace(/postgres(?:ql)?:\/\/\S+/gi, "[DATABASE]")
          .slice(-350);
      });
      child.stdout.resume(); // Simulate consumer losing success payload; persisted state is authoritative.
      child.on("error", fail);
      child.on("close", (code) =>
        code === 0
          ? done({ pid, exitedAt: new Date().toISOString() })
          : fail(new Error(`Controlled CLI failed ${String(code)}: ${stderr}`)),
      );
    },
  );
  return { pid, result };
}
