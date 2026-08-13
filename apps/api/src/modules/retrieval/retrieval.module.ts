import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AntiAbuseModule } from "../anti-abuse/anti-abuse.module";
import { AuthModule } from "../auth/auth.module";
import { GuestAccessModule } from "../guest-access/guest-access.module";
import { GuestRetrievalController } from "./guest-retrieval.controller";
import { MarkReadyController } from "./mark-ready.controller";
import { MarkReadyService } from "./mark-ready.service";
import { RetrievalService } from "./retrieval.service";
import { StartRetrievalController } from "./start-retrieval.controller";
import { StartRetrievalService } from "./start-retrieval.service";

@Module({
  controllers: [
    GuestRetrievalController,
    MarkReadyController,
    StartRetrievalController,
  ],
  imports: [
    AntiAbuseModule,
    AuthModule,
    GuestAccessModule,
    HttpInfrastructureModule,
    RuntimeDatabaseModule,
  ],
  providers: [RetrievalService, MarkReadyService, StartRetrievalService],
})
export class RetrievalModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(
        GuestRetrievalController,
        MarkReadyController,
        StartRetrievalController,
      );
  }
}
