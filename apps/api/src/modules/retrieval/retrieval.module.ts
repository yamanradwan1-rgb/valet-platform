import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AntiAbuseModule } from "../anti-abuse/anti-abuse.module";
import { GuestAccessModule } from "../guest-access/guest-access.module";
import { GuestRetrievalController } from "./guest-retrieval.controller";
import { RetrievalService } from "./retrieval.service";
import { StartRetrievalController } from "./start-retrieval.controller";
import { StartRetrievalService } from "./start-retrieval.service";

@Module({
  controllers: [GuestRetrievalController, StartRetrievalController],
  imports: [
    AntiAbuseModule,
    GuestAccessModule,
    HttpInfrastructureModule,
    RuntimeDatabaseModule,
  ],
  providers: [RetrievalService, StartRetrievalService],
})
export class RetrievalModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(GuestRetrievalController, StartRetrievalController);
  }
}
