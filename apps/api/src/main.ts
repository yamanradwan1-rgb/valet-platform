import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module";
import { createHttpMetricsMiddleware } from "./common/observability/http-metrics.middleware";
import { createApplicationDrainMiddleware } from "./health/application-drain-middleware";
import { ApplicationDrainState } from "./health/application-drain-state";
import {
  applicationShutdownSignals,
  armEarlyShutdownWithdrawal,
} from "./health/early-shutdown-withdrawal";
import { configureLocalMfaBypassPolicy } from "./modules/auth/mfa/local-mfa-bypass";
import { readFcmHttpV1Config } from "./modules/staff-push/fcm-http-v1-config";
import { readStaffPushOperationalPolicy } from "./modules/staff-push/staff-push-operational-policy";

const startupLogger = new Logger("LocalMfaBypass");

async function bootstrap() {
  const localMfaBypass = configureLocalMfaBypassPolicy(process.env);
  if (localMfaBypass.enabled) {
    startupLogger.warn("WARNING: local development MFA bypass is enabled.");
  }
  const policy = readStaffPushOperationalPolicy(process.env);
  readFcmHttpV1Config(
    process.env,
    policy.sendingEnabled,
    policy.providerCallTimeoutSeconds,
  );
  const app = await NestFactory.create(AppModule, {
    forceCloseConnections: true,
    // Meta's signed callback requires the exact original JSON request bytes.
    // Nest captures only parsed JSON/urlencoded request bodies, never the
    // photo multipart/streaming body routes. Do not log request.rawBody.
    rawBody: true,
  });
  app.use(createHttpMetricsMiddleware());
  app.use(createApplicationDrainMiddleware(app.get(ApplicationDrainState)));
  const swaggerConfig = new DocumentBuilder()
    .setTitle("Valet Platform API")
    .setDescription("Valet platform operational API")
    .setVersion("0.0.0")
    .build();

  SwaggerModule.setup(
    "docs",
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  app.enableShutdownHooks([...applicationShutdownSignals]);
  armEarlyShutdownWithdrawal(app, app.get(ApplicationDrainState), process);
  const port = Number.parseInt(process.env.PORT ?? "3001", 10);
  // The Owner-approved Issue #300 R2 local proof may not expose either
  // disposable test API listener beyond loopback. All other boot paths retain
  // their original binding behavior.
  if (
    process.env.NODE_ENV === "test" &&
    process.env.ISSUE300_R2_LOCAL_API_ONLY === "1" &&
    (port === 3164 || port === 3165)
  ) {
    await app.listen(port, "127.0.0.1");
  } else {
    await app.listen(port);
  }
}

void bootstrap();
