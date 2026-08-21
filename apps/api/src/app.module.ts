import { Module } from "@nestjs/common";

import { AppController } from "./app.controller";
import { AntiAbuseModule } from "./modules/anti-abuse/anti-abuse.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CheckInModule } from "./modules/check-in-api/check-in.module";
import { DispatchModule } from "./modules/dispatch/dispatch.module";
import { GuestAccessModule } from "./modules/guest-access/guest-access.module";
import { KeyCustodyModule } from "./modules/keys/key-custody.module";
import { MapSetupModule } from "./modules/map-setup/map-setup.module";
import { StartParkingModule } from "./modules/parking/start-parking.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { RetrievalModule } from "./modules/retrieval/retrieval.module";
import { ShiftModule } from "./modules/shifts/shift.module";
import { StaffModule } from "./modules/staff/staff.module";
import { TrackingModule } from "./modules/tracking/tracking.module";

@Module({
  imports: [
    AuthModule,
    AntiAbuseModule,
    GuestAccessModule,
    CheckInModule,
    ShiftModule,
    StaffModule,
    KeyCustodyModule,
    MapSetupModule,
    DispatchModule,
    StartParkingModule,
    PaymentsModule,
    RetrievalModule,
    TrackingModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
