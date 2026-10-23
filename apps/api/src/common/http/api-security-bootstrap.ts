import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { setNoStoreResponseHeaders } from "./no-store-response";

export interface ApiHeaderResponse {
  setHeader(name: string, value: string): void;
}

/**
 * These are API response controls, not assumptions about the public TLS edge.
 * Keep browser cross-origin isolation and HSTS at their separately verified
 * application/ingress owners.
 */
export function setApiSecurityResponseHeaders(
  response: ApiHeaderResponse,
): void {
  setNoStoreResponseHeaders(response);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
}

export function shouldExposeApiDocumentation(nodeEnv: string | undefined) {
  // Fail closed on missing/unknown environment as well as production.
  // Neither the UI nor /docs-json or /docs-yaml can be exposed by omission.
  return nodeEnv === "development" || nodeEnv === "test";
}

export function configureApiDocumentation(
  app: INestApplication,
  nodeEnv: string | undefined,
): void {
  if (!shouldExposeApiDocumentation(nodeEnv)) return;

  const config = new DocumentBuilder()
    .setTitle("Valet Platform API")
    .setDescription("Valet platform operational API")
    .setVersion("0.0.0")
    .build();

  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, config));
}
