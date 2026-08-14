import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AuthModule } from "../auth/auth.module";
import { GpsIngestionController } from "./gps-ingestion.controller";
import { GpsIngestionService } from "./gps-ingestion.service";

@Module({
  controllers: [GpsIngestionController],
  imports: [AuthModule, RuntimeDatabaseModule, HttpInfrastructureModule],
  providers: [GpsIngestionService],
})
export class TrackingModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(GpsIngestionController);
  }
}
