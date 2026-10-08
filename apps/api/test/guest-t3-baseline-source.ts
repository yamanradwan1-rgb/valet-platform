import { copyFileSync, existsSync, mkdirSync, symlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  Controller,
  Get,
  Module,
  Query,
  Req,
  Res,
  type MiddlewareConsumer,
  type NestModule,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { PostgresPool } from "../src/common/database/postgres";
import type { ApiRequest } from "../src/common/http/api-request";
import { RequestIdMiddleware } from "../src/common/http/api-request";
import { HttpInfrastructureModule } from "../src/common/http/http-infrastructure.module";
import { ApiOperationRunner } from "../src/common/http/api-operation-runner";
import type { HeaderResponse } from "../src/common/http/no-store-response";
import { AntiAbuseService } from "../src/modules/anti-abuse/anti-abuse.service";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { TrustedClientAddressResolver } from "../src/modules/anti-abuse/client-address";
import { GuestAuthOriginPolicy } from "../src/modules/guest-access/guest-browser-transport";
import type { GuestAccessService } from "../src/modules/guest-access/guest-access.service";

export const baselineSha = "95b515e7094145eaafa2f70ac583b2a63b68bec0";
export const t3RepositoryRoot = resolve(process.cwd(), "../..");
const artifact = resolve(
  t3RepositoryRoot,
  `tmp/guest-t3-baseline-${process.pid}`,
);

export function prepareT1Source(): void {
  if (existsSync(`${artifact}/apps/api/tsconfig.json`)) return;
  mkdirSync(artifact, { recursive: true });
  const archive = `${artifact}/source.tar`;
  execFileSync(
    "git",
    [
      "archive",
      "--format=tar",
      `--output=${archive}`,
      baselineSha,
      "apps/api/src",
      "apps/api/tsconfig.json",
      "tsconfig.base.json",
    ],
    { cwd: t3RepositoryRoot, windowsHide: true },
  );
  execFileSync("tar", ["-xf", archive, "-C", artifact], {
    cwd: t3RepositoryRoot,
    windowsHide: true,
  });
  // Workspace packages resolve from the unchanged API dependency tree.
  symlinkSync(
    `${t3RepositoryRoot}/apps/api/node_modules`,
    `${artifact}/apps/api/node_modules`,
    "junction",
  );
  copyFileSync(
    `${t3RepositoryRoot}/apps/api/tsconfig.json`,
    `${artifact}/apps/api/tsconfig.json`,
  );
}

async function original<T>(path: string): Promise<T> {
  return (await import(
    pathToFileURL(resolve(artifact, `apps/api/src/${path}.ts`)).href
  )) as T;
}

export interface T1Controller {
  getSession(
    request: ApiRequest,
    query: unknown,
    response: HeaderResponse,
  ): Promise<unknown>;
}

export async function createT1Controller(
  pool: PostgresPool,
  access: GuestAccessService,
): Promise<T1Controller> {
  prepareT1Source();
  const service = await original<{ AntiAbuseService: typeof AntiAbuseService }>(
    "modules/anti-abuse/anti-abuse.service",
  );
  const authorizer = await original<{
    GuestCredentialAuthorizer: new (...args: unknown[]) => unknown;
  }>("modules/guest-access/guest-credential-authorizer");
  const controller = await original<{
    GuestAccessController: new (...args: unknown[]) => T1Controller;
  }>("modules/guest-access/guest-access.controller");
  const antiAbuse = new service.AntiAbuseService(
    pool,
    new AntiAbuseKeyDeriver(),
  );
  return new controller.GuestAccessController(
    access,
    new ApiOperationRunner(
      { now: () => performance.now() },
      { observe: () => undefined },
    ),
    antiAbuse,
    new authorizer.GuestCredentialAuthorizer(
      antiAbuse,
      new TrustedClientAddressResolver(),
      new GuestAuthOriginPolicy(),
    ),
  );
}

export async function startT1Api(controller: T1Controller) {
  @Controller("v1/guest")
  class T1Route {
    @Get("session")
    read(
      @Req() request: ApiRequest,
      @Query() query: unknown,
      @Res({ passthrough: true }) response: HeaderResponse,
    ) {
      return controller.getSession(request, query, response);
    }
  }
  @Module({ controllers: [T1Route], imports: [HttpInfrastructureModule] })
  class T1Module implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
      consumer.apply(RequestIdMiddleware).forRoutes(T1Route);
    }
  }
  const app = await NestFactory.create(T1Module, { logger: false });
  await app.listen(0, "127.0.0.1");
  return { app, baseUrl: await app.getUrl() };
}
