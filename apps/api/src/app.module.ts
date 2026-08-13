import { Module } from "@nestjs/common";

import { AppController } from "./app.controller";
import { AntiAbuseModule } from "./modules/anti-abuse/anti-abuse.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CheckInModule } from "./modules/check-in-api/check-in.module";
import { DispatchModule } from "./modules/dispatch/dispatch.module";
import { GuestAccessModule } from "./modules/guest-access/guest-access.module";
import { KeyCustodyModule } from "./modules/keys/key-custody.module";
import { StartParkingModule } from "./modules/parking/start-parking.module";
import { RetrievalModule } from "./modules/retrieval/retrieval.module";
import { ShiftModule } from "./modules/shifts/shift.module";

@Module({
  imports: [
    AuthModule,
    AntiAbuseModule,
    GuestAccessModule,
    CheckInModule,
    ShiftModule,
    KeyCustodyModule,
    DispatchModule,
    StartParkingModule,
    RetrievalModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
