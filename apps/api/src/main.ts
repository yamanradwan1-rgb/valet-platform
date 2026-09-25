import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./app.module";
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
  const app = await NestFactory.create(AppModule);
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
  const port = Number.parseInt(process.env.PORT ?? "3001", 10);
  await app.listen(port);
}

void bootstrap();
