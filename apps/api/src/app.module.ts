import { Module } from "@nestjs/common";

import { AppController } from "./app.controller";
import { CheckInApiModule } from "./modules/check-in-api/check-in-api.module";

@Module({
  imports: [CheckInApiModule],
  controllers: [AppController],
})
export class AppModule {}
