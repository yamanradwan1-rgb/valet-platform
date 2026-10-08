import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module";
import { createHttpMetricsMiddleware } from "./common/observability/http-metrics.middleware";
import { createApplicationDrainMiddleware } from "./health/application-drain-middleware";
import { ApplicationDrainState } from "./health/application-drain-state";
import { armEarlyShutdownWithdrawal } from "./health/early-shutdown-withdrawal";
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

  app.enableShutdownHooks();
  armEarlyShutdownWithdrawal(app, app.get(ApplicationDrainState), process);
  const port = Number.parseInt(process.env.PORT ?? "3001", 10);
  await app.listen(port);
}

void bootstrap();
