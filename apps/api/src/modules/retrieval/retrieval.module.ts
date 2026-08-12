import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AntiAbuseModule } from "../anti-abuse/anti-abuse.module";
import { GuestAccessModule } from "../guest-access/guest-access.module";
import { GuestRetrievalController } from "./guest-retrieval.controller";
import { RequestRetrievalService } from "./request-retrieval.service";

@Module({
  controllers: [GuestRetrievalController],
  imports: [AntiAbuseModule, GuestAccessModule, HttpInfrastructureModule],
  providers: [RequestRetrievalService],
})
export class RetrievalModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(GuestRetrievalController);
  }
}
