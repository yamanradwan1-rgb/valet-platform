import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AuthModule } from "../auth/auth.module";
import { ManagementContextController } from "./management-context.controller";
import { ManagementContextService } from "./management-context.service";
import { StaffDirectoryService } from "./staff-directory.service";
import { StaffManagementController } from "./staff-management.controller";
import { StaffManagementMutationService } from "./staff-management-mutation.service";

@Module({
  controllers: [ManagementContextController, StaffManagementController],
  imports: [AuthModule, RuntimeDatabaseModule, HttpInfrastructureModule],
  providers: [
    ManagementContextService,
    StaffDirectoryService,
    StaffManagementMutationService,
  ],
  exports: [ManagementContextService],
})
export class ManagementModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(ManagementContextController, StaffManagementController);
  }
}
