import type { INestApplication } from "@nestjs/common";
import { SwaggerModule } from "@nestjs/swagger";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  configureApiDocumentation,
  setApiSecurityResponseHeaders,
  shouldExposeApiDocumentation,
} from "../src/common/http/api-security-bootstrap";

afterEach(() => vi.restoreAllMocks());

describe("API security bootstrap", () => {
  it("applies no-store and browser defensive headers without HSTS or cross-origin isolation assumptions", () => {
    const headers = new Map<string, string>();
    setApiSecurityResponseHeaders({
      setHeader: (name, value) => headers.set(name, value),
    });

    expect(Object.fromEntries(headers)).toEqual({
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
    expect(headers.has("Strict-Transport-Security")).toBe(false);
    expect(headers.has("Cross-Origin-Embedder-Policy")).toBe(false);
  });

  it("does not register Swagger UI or JSON/YAML document routes in production", () => {
    const createDocument = vi.spyOn(SwaggerModule, "createDocument");
    const setup = vi.spyOn(SwaggerModule, "setup");
    const app = {} as INestApplication;

    expect(shouldExposeApiDocumentation("production")).toBe(false);
    configureApiDocumentation(app, "production");

    expect(createDocument).not.toHaveBeenCalled();
    expect(setup).not.toHaveBeenCalled();
  });

  it.each([undefined, "development", "test"])(
    "keeps Swagger explicitly registered in %s environment",
    (nodeEnv) => {
      const createDocument = vi
        .spyOn(SwaggerModule, "createDocument")
        .mockReturnValue({} as ReturnType<typeof SwaggerModule.createDocument>);
      const setup = vi.spyOn(SwaggerModule, "setup").mockImplementation(() => {});
      const app = {} as INestApplication;

      expect(shouldExposeApiDocumentation(nodeEnv)).toBe(true);
      configureApiDocumentation(app, nodeEnv);

      expect(createDocument).toHaveBeenCalledOnce();
      expect(setup).toHaveBeenCalledOnce();
      expect(setup.mock.calls[0]?.[0]).toBe("docs");
      expect(setup.mock.calls[0]?.[1]).toBe(app);
      vi.restoreAllMocks();
    },
  );
});
