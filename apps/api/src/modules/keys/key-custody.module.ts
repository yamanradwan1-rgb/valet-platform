import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AuthModule } from "../auth/auth.module";
import { KeyCustodyController } from "./key-custody.controller";
import { KeyCustodyService } from "./key-custody.service";

@Module({
  controllers: [KeyCustodyController],
  imports: [AuthModule, RuntimeDatabaseModule, HttpInfrastructureModule],
  providers: [KeyCustodyService],
})
export class KeyCustodyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(KeyCustodyController);
  }
}
