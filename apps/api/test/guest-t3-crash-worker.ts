import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { createRuntimePostgresPool } from "../src/common/database/postgres";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { AntiAbuseService } from "../src/modules/anti-abuse/anti-abuse.service";

async function start() {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    !/^vlt_005b_/.test(url.pathname.slice(1)) ||
    url.pathname.slice(1) !== process.env.T3_OWNED_DATABASE ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  ) {
    throw new Error(
      "Crash evidence requires the exact owned local disposable DB.",
    );
  }
  const pool = createRuntimePostgresPool(url.toString(), {
    NODE_ENV: "test",
    DATABASE_POOL_MAX: "1",
  });
  const service = new AntiAbuseService(pool, new AntiAbuseKeyDeriver());
  @Controller()
  class CrashController {
    @Get("reserve")
    async reserve() {
      const reservation = await service.reserve(
        service.key("v1:guest-client-address", "127.0.0.1"),
        60,
      );
      if (!reservation.allowed)
        throw new Error("Unexpected exhausted fixture.");
      process.send?.({ reserved: true });
      // The parent kills this real Nest process between committed reservation and finalization.
      return await new Promise<void>(() => undefined);
    }
  }
  @Module({ controllers: [CrashController] })
  class CrashModule {}
  const app = await NestFactory.create(CrashModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  process.send?.({ url: await app.getUrl() });
}

void start().catch(() => {
  process.send?.({ failed: true });
  process.exit(1);
});
