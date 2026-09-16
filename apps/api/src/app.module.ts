import { Module } from "@nestjs/common";

import { AppController } from "./app.controller";
import { AntiAbuseModule } from "./modules/anti-abuse/anti-abuse.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CheckInModule } from "./modules/check-in-api/check-in.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { DispatchModule } from "./modules/dispatch/dispatch.module";
import { GuestAccessModule } from "./modules/guest-access/guest-access.module";
import { KeyCustodyModule } from "./modules/keys/key-custody.module";
import { MapSetupModule } from "./modules/map-setup/map-setup.module";
import { ManagementModule } from "./modules/management/management.module";
import { StartParkingModule } from "./modules/parking/start-parking.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { RetrievalModule } from "./modules/retrieval/retrieval.module";
import { ShiftModule } from "./modules/shifts/shift.module";
import { StaffModule } from "./modules/staff/staff.module";
import { StaffPushModule } from "./modules/staff-push/staff-push.module";
import { TrackingModule } from "./modules/tracking/tracking.module";

@Module({
  imports: [
    AuthModule,
    AntiAbuseModule,
    GuestAccessModule,
    CheckInModule,
    DashboardModule,
    ShiftModule,
    StaffModule,
    StaffPushModule,
    KeyCustodyModule,
    MapSetupModule,
    ManagementModule,
    DispatchModule,
    StartParkingModule,
    PaymentsModule,
    RetrievalModule,
    TrackingModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
