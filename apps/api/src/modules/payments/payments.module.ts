import { Module } from "@nestjs/common";

import { RuntimeDatabaseModule } from "../../common/database/runtime-database.module";
import { PaymentInitializationService } from "./payment-initialization.service";

@Module({
  imports: [RuntimeDatabaseModule],
  providers: [PaymentInitializationService],
  exports: [PaymentInitializationService],
})
export class PaymentsModule {}
