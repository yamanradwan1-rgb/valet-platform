import "reflect-metadata";

import { createRequire } from "node:module";
import { resolve } from "node:path";

import { NestFactory } from "@nestjs/core";

type Signal = {
  event: string;
  trace?: string;
  status?: number;
  at?: string;
  pid?: number;
  baseUrl?: string;
  finished?: boolean;
  cause?: string;
};
const load = createRequire(resolve(process.cwd(), "package.json"));
const root = process.cwd();
const { AppModule } = load(resolve(root, "dist/app.module.js")) as {
  AppModule: typeof import("../src/app.module").AppModule;
};
const { DashboardScopeDiscoveryService } = load(
  resolve(root, "dist/modules/dashboard/dashboard-scope-discovery.service.js"),
) as {
  DashboardScopeDiscoveryService: typeof import("../src/modules/dashboard/dashboard-scope-discovery.service").DashboardScopeDiscoveryService;
};

function emit(signal: Signal): void {
  process.send?.({
    ...signal,
    pid: process.pid,
    at: signal.at ?? new Date().toISOString(),
  });
}

const held = new Map<string, () => void>();
const original = DashboardScopeDiscoveryService.prototype.listLocations;
if (process.env.ISSUE333_U002_HOLD_READER === "true") {
  DashboardScopeDiscoveryService.prototype.listLocations = async function (
    ...args
  ) {
    const projection = await original.apply(this, args);
    const trace = process.env.ISSUE333_U002_TRACE ?? "reader";
    await new Promise<void>((release) => {
      held.set(trace, release);
      emit({ event: "sql-completed-http-held", trace });
    });
    emit({ event: "http-handler-released", trace });
    return projection;
  };
}

async function start(): Promise<void> {
  const directory =
    process.env.ISSUE333_PG_PRIVATE_DATADIR?.replaceAll("\\", "/") ?? "";
  const database = new URL(process.env.DATABASE_URL ?? "invalid:");
  if (
    process.platform !== "win32" ||
    process.env.NODE_ENV !== "test" ||
    process.env.ISSUE333_EPHEMERAL_PG !== "I_OWN_THIS_CLUSTER" ||
    !directory.includes("/tmp/issue-315-pg-qa/issue319-") ||
    !directory.endsWith("/.issue315-private-cluster") ||
    database.protocol !== "postgresql:" ||
    database.hostname !== "127.0.0.1" ||
    database.pathname === "/postgres" ||
    !process.send
  )
    throw new Error("Owned disposable child process attestation failed.");

  const app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });
  app.use(
    (
      request: { headers: Record<string, string | undefined> },
      response: {
        statusCode: number;
        writableFinished: boolean;
        on: (name: string, callback: () => void) => void;
      },
      next: () => void,
    ) => {
      const trace = request.headers["x-u002-trace"];
      if (trace) {
        response.on("finish", () =>
          emit({
            event: "http-finish",
            trace,
            status: response.statusCode,
            finished: true,
          }),
        );
        response.on("close", () =>
          emit({
            event: "http-close",
            trace,
            status: response.statusCode,
            finished: response.writableFinished,
          }),
        );
      }
      next();
    },
  );
  process.on("message", (signal: { action?: string; trace?: string }) => {
    if (signal.action === "release" && signal.trace) {
      const release = held.get(signal.trace);
      held.delete(signal.trace);
      release?.();
    }
  });
  await app.listen(0, "127.0.0.1");
  emit({ event: "ready", baseUrl: await app.getUrl() });
}

void start().catch((error: unknown) => {
  const cause = (error instanceof Error ? error.message : "Nest child failed")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[DATABASE]")
    .replace(/(?:password|token|secret)\s*[:=]\s*\S+/gi, "[REDACTED]")
    .slice(0, 250);
  emit({ event: "bootstrap-error", cause });
  process.exitCode = 1;
});
