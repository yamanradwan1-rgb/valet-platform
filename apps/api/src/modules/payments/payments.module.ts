import { MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";

import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { HttpInfrastructureModule } from "../../common/http/http-infrastructure.module";
import { RequestIdMiddleware } from "../../common/http/api-request";
import { AntiAbuseModule } from "../anti-abuse/anti-abuse.module";
import { AuthModule } from "../auth/auth.module";
import { GuestAccessModule } from "../guest-access/guest-access.module";
import { GuestPaymentController } from "./guest-payment.controller";
import { PaymentInitializationService } from "./payment-initialization.service";
import { PaymentMutationService } from "./payment-mutation.service";
import { StaffPaymentController } from "./staff-payment.controller";

@Module({
  controllers: [StaffPaymentController, GuestPaymentController],
  imports: [
    AuthModule,
    AntiAbuseModule,
    GuestAccessModule,
    RuntimeDatabaseModule,
    HttpInfrastructureModule,
  ],
  providers: [PaymentInitializationService, PaymentMutationService],
  exports: [PaymentInitializationService, PaymentMutationService],
})
export class PaymentsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(StaffPaymentController, GuestPaymentController);
  }
}
