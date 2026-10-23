import "reflect-metadata";

import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

import {
  configureApiDocumentation,
  setApiSecurityResponseHeaders,
  type ApiHeaderResponse,
} from "../src/common/http/api-security-bootstrap";

@Controller("v1/probe")
class ProbeController {
  @Get()
  read() {
    return { ok: true };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

async function withApi(
  nodeEnv: string,
  verify: (origin: string) => Promise<void>,
) {
  const app = await NestFactory.create(ProbeModule, { logger: false });
  const expressApp = app.getHttpAdapter().getInstance() as {
    disable(setting: string): void;
  };
  expressApp.disable("x-powered-by");
  app.use(
    (_request: unknown, response: ApiHeaderResponse, next: () => void) => {
      setApiSecurityResponseHeaders(response);
      next();
    },
  );
  configureApiDocumentation(app, nodeEnv);

  try {
    await app.listen(0, "127.0.0.1");
    const { port } = app.getHttpServer().address() as AddressInfo;
    await verify(`http://127.0.0.1:${port}`);
  } finally {
    await app.close();
  }
}

describe("API HTTP security configuration", () => {
  it("does not expose Swagger UI or raw JSON/YAML docs in production", async () => {
    await withApi("production", async (origin) => {
      for (const path of ["/docs", "/docs/", "/docs-json", "/docs-yaml"]) {
        const response = await fetch(`${origin}${path}`, {
          redirect: "manual",
        });
        expect(response.status, path).toBe(404);
        expect(response.headers.get("cache-control"), path).toBe("no-store");
      }

      const probe = await fetch(`${origin}/v1/probe`);
      expect(probe.status).toBe(200);
      expect(await probe.json()).toEqual({ ok: true });
      expect(probe.headers.get("cache-control")).toBe("no-store");
      expect(probe.headers.get("x-powered-by")).toBeNull();
      expect(probe.headers.get("x-content-type-options")).toBe("nosniff");
      expect(probe.headers.get("x-frame-options")).toBe("DENY");
      expect(probe.headers.get("content-security-policy")).toBe(
        "frame-ancestors 'none'",
      );
    });
  });

  it("preserves development Swagger UI and JSON documentation", async () => {
    await withApi("development", async (origin) => {
      const ui = await fetch(`${origin}/docs`);
      expect(ui.status).toBe(200);
      expect(ui.headers.get("content-type")).toContain("text/html");

      const document = await fetch(`${origin}/docs-json`);
      expect(document.status).toBe(200);
      const json = (await document.json()) as { openapi?: string };
      expect(json.openapi).toMatch(/^3\./);
    });
  });
});
