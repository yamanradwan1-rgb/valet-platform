import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import {
  configureApiDocumentation,
  setApiSecurityResponseHeaders,
  type ApiHeaderResponse,
} from "./common/http/api-security-bootstrap";
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
  app.use(createHttpMetricsMiddleware());
  app.use(createApplicationDrainMiddleware(app.get(ApplicationDrainState)));
  configureApiDocumentation(app, process.env.NODE_ENV);

  app.enableShutdownHooks([...applicationShutdownSignals]);
  armEarlyShutdownWithdrawal(app, app.get(ApplicationDrainState), process);
  const port = Number.parseInt(process.env.PORT ?? "3001", 10);
  // Any Owner-approved Issue #300 R2 isolated proof API must remain on
  // loopback, including a newly attested port distinct from the human API.
  // All non-R2 boot paths retain their original binding behavior.
  if (
    process.env.NODE_ENV === "test" &&
    process.env.ISSUE300_R2_LOCAL_API_ONLY === "1"
  ) {
    await app.listen(port, "127.0.0.1");
  } else {
    await app.listen(port);
  }
}

void bootstrap();
