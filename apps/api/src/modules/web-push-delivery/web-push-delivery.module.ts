import { Module } from "@nestjs/common";
import type { WebPushServerConfig } from "@valet/config";

import {
  RuntimeDatabaseModule,
  RUNTIME_POSTGRES_POOL,
} from "../../common/database/runtime-database.module";
import type { PostgresPool } from "../../common/database/postgres";
import { WEB_PUSH_SERVER_CONFIG } from "../web-push/web-push-subscription.tokens";
import { WebPushSubscriptionModule } from "../web-push/web-push-subscription.module";
import { NodeWebPushSender } from "./web-push-sender";
import { WebPushDeliveryWorker } from "./web-push-delivery-worker";

@Module({
  imports: [RuntimeDatabaseModule, WebPushSubscriptionModule],
  providers: [
    {
      provide: WebPushDeliveryWorker,
      inject: [RUNTIME_POSTGRES_POOL, WEB_PUSH_SERVER_CONFIG],
      useFactory: (pool: PostgresPool, config: WebPushServerConfig) =>
        new WebPushDeliveryWorker(pool, config, new NodeWebPushSender(config)),
    },
  ],
})
export class WebPushDeliveryModule {}
