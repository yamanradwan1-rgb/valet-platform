import { MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { RuntimeDatabaseModule } from "../src/common/database/runtime-database.module";
import { IncidentReportingController } from "../src/modules/incidents/incident-reporting.controller";
import { IncidentReportingService } from "../src/modules/incidents/incident-reporting.service";
import { IncidentRecoveryController } from "../src/modules/incidents/incident-recovery.controller";
import { IncidentRecoveryService } from "../src/modules/incidents/incident-recovery.service";
import { AntiAbuseModule } from "../src/modules/anti-abuse/anti-abuse.module";
import { AntiAbuseKeyDeriver } from "../src/modules/anti-abuse/anti-abuse-key";
import { AntiAbuseService } from "../src/modules/anti-abuse/anti-abuse.service";
import { TrustedClientAddressResolver } from "../src/modules/anti-abuse/client-address";
import { AuthModule } from "../src/modules/auth/auth.module";
import { MfaAssurancePolicy } from "../src/modules/auth/mfa/mfa-assurance-policy";
import { StaffMfaController } from "../src/modules/auth/mfa/staff-mfa.controller";
import { NativeStaffAuthController } from "../src/modules/auth/native-staff-auth.controller";
import { StaffAuthController } from "../src/modules/auth/staff-auth.controller";
import { STAFF_PRINCIPAL_RESOLVER } from "../src/modules/auth/staff-principal";
import { STAFF_SESSION_CONTEXT_RESOLVER } from "../src/modules/auth/staff-session-context";
import { StaffCheckInController } from "../src/modules/check-in-api/check-in-api.controller";
import { CheckInApiService } from "../src/modules/check-in-api/check-in-api.service";
import { CheckInModule } from "../src/modules/check-in-api/check-in.module";
import { DashboardModule } from "../src/modules/dashboard/dashboard.module";
import { CheckInOperationRunner } from "../src/modules/check-in-api/check-in-operation-runner";
import { PlateOcrAuthGuard } from "../src/modules/check-in-api/plate-ocr-auth.guard";
import { PlateOcrController } from "../src/modules/check-in-api/plate-ocr.controller";
import { PlateOcrCostGuard } from "../src/modules/check-in-api/plate-ocr-cost-guard";
import { PLATE_OCR_PROVIDER } from "../src/modules/check-in-api/plate-ocr-provider";
import { PlateOcrService } from "../src/modules/check-in-api/plate-ocr.service";
import { ReturningCheckInController } from "../src/modules/check-in-api/returning-check-in.controller";
import { DispatchController } from "../src/modules/dispatch/dispatch.controller";
import { DispatchModule } from "../src/modules/dispatch/dispatch.module";
import { DispatchService } from "../src/modules/dispatch/dispatch.service";
import { GuestAccessModule } from "../src/modules/guest-access/guest-access.module";
import { KeyCustodyController } from "../src/modules/keys/key-custody.controller";
import { KeyCustodyModule } from "../src/modules/keys/key-custody.module";
import { KeyCustodyService } from "../src/modules/keys/key-custody.service";
import { MapSetupController } from "../src/modules/map-setup/map-setup.controller";
import { MapSetupModule } from "../src/modules/map-setup/map-setup.module";
import { MapSetupService } from "../src/modules/map-setup/map-setup.service";
import { ManagementModule } from "../src/modules/management/management.module";
import { StartParkingController } from "../src/modules/parking/start-parking.controller";
import { StartParkingModule } from "../src/modules/parking/start-parking.module";
import { StartParkingService } from "../src/modules/parking/start-parking.service";
import { ConfirmParkedController } from "../src/modules/parking/confirm-parked.controller";
import { ConfirmParkedService } from "../src/modules/parking/confirm-parked.service";
import { CashMutationService } from "../src/modules/payments/cash-mutation.service";
import { PaymentInitializationService } from "../src/modules/payments/payment-initialization.service";
import { DigitalCollectionService } from "../src/modules/payments/digital-collection.service";
import {
  DigitalPaymentProviderRegistry,
  UnconfiguredDigitalPaymentProviderRegistry,
} from "../src/modules/payments/digital-payment-provider";
import { PaymentMutationService } from "../src/modules/payments/payment-mutation.service";
import { PaymentProjectionService } from "../src/modules/payments/payment-projection.service";
import { RefundService } from "../src/modules/payments/refund.service";
import { PaymentsModule } from "../src/modules/payments/payments.module";
import { GuestPaymentController } from "../src/modules/payments/guest-payment.controller";
import { StaffPaymentController } from "../src/modules/payments/staff-payment.controller";
import { CompleteHandoffController } from "../src/modules/retrieval/complete-handoff.controller";
import { CompleteHandoffService } from "../src/modules/retrieval/complete-handoff.service";
import { GuestRetrievalController } from "../src/modules/retrieval/guest-retrieval.controller";
import { HandoffGuestController } from "../src/modules/retrieval/handoff-guest.controller";
import { HandoffStaffController } from "../src/modules/retrieval/handoff-staff.controller";
import { HandoffService } from "../src/modules/retrieval/handoff.service";
import { MarkReadyController } from "../src/modules/retrieval/mark-ready.controller";
import { RetrievalModule } from "../src/modules/retrieval/retrieval.module";
import { RetrievalService } from "../src/modules/retrieval/retrieval.service";
import { StartRetrievalController } from "../src/modules/retrieval/start-retrieval.controller";
import { StartRetrievalService } from "../src/modules/retrieval/start-retrieval.service";
import { MarkReadyService } from "../src/modules/retrieval/mark-ready.service";
import { ShiftController } from "../src/modules/shifts/shift.controller";
import { ShiftModule } from "../src/modules/shifts/shift.module";
import { ShiftService } from "../src/modules/shifts/shift.service";
import { ShiftPresenceController } from "../src/modules/shifts/shift-presence.controller";
import { ShiftPresenceService } from "../src/modules/shifts/shift-presence.service";
import { StaffCheckInContinuationsController } from "../src/modules/staff/staff-check-in-continuations.controller";
import { StaffCheckInContinuationsService } from "../src/modules/staff/staff-check-in-continuations.service";
import { StaffCheckInDraftsController } from "../src/modules/staff/staff-check-in-drafts.controller";
import { StaffCheckInDraftsService } from "../src/modules/staff/staff-check-in-drafts.service";
import { StaffOperationalContextController } from "../src/modules/staff/staff-operational-context.controller";
import { StaffOperationalContextService } from "../src/modules/staff/staff-operational-context.service";
import { StaffValetSessionController } from "../src/modules/staff/staff-valet-session.controller";
import { StaffValetSessionService } from "../src/modules/staff/staff-valet-session.service";
import { StaffVehicleDirectoryService } from "../src/modules/staff/staff-vehicle-directory.service";
import { StaffModule } from "../src/modules/staff/staff.module";
import { StaffPushModule } from "../src/modules/staff-push/staff-push.module";
import { StaffPushOperationalPolicy } from "../src/modules/staff-push/staff-push-operational-policy";
import { GpsIngestionController } from "../src/modules/tracking/gps-ingestion.controller";
import { GpsIngestionService } from "../src/modules/tracking/gps-ingestion.service";
import { LiveMapController } from "../src/modules/tracking/live-map.controller";
import { LiveMapService } from "../src/modules/tracking/live-map.service";
import { RouteHistoryController } from "../src/modules/tracking/route-history.controller";
import { RouteHistoryService } from "../src/modules/tracking/route-history.service";
import { TrackingModule } from "../src/modules/tracking/tracking.module";

function metadata<T>(module: object, key: string): T[] {
  return (Reflect.getMetadata(key, module) as T[] | undefined) ?? [];
}

describe("accepted feature module ownership", () => {
  it("composes the accepted feature modules directly from AppModule", () => {
    expect(metadata(AppModule, MODULE_METADATA.IMPORTS)).toEqual([
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
    ]);
  });

  it("owns only the accepted narrow Payment mutation and projection surfaces", () => {
    expect(metadata(PaymentsModule, MODULE_METADATA.CONTROLLERS)).toEqual([
      StaffPaymentController,
      GuestPaymentController,
    ]);
    expect(metadata(PaymentsModule, MODULE_METADATA.PROVIDERS)).toEqual([
      CashMutationService,
      DigitalCollectionService,
      {
        provide: DigitalPaymentProviderRegistry,
        useClass: UnconfiguredDigitalPaymentProviderRegistry,
      },
      PaymentInitializationService,
      PaymentMutationService,
      PaymentProjectionService,
      RefundService,
    ]);
    expect(metadata(PaymentsModule, MODULE_METADATA.EXPORTS)).toEqual([
      CashMutationService,
      DigitalPaymentProviderRegistry,
      DigitalCollectionService,
      PaymentInitializationService,
      PaymentMutationService,
      RefundService,
    ]);
  });

  it("keeps GPS ingestion ownership focused", () => {
    expect(metadata(TrackingModule, MODULE_METADATA.CONTROLLERS)).toEqual([
      GpsIngestionController,
      LiveMapController,
      RouteHistoryController,
    ]);
    expect(metadata(TrackingModule, MODULE_METADATA.PROVIDERS)).toEqual([
      GpsIngestionService,
      LiveMapService,
      RouteHistoryService,
    ]);
  });

  it("keeps map setup ownership focused", () => {
    expect(metadata(MapSetupModule, MODULE_METADATA.CONTROLLERS)).toEqual([
      MapSetupController,
    ]);
    expect(metadata(MapSetupModule, MODULE_METADATA.PROVIDERS)).toEqual([
      MapSetupService,
    ]);
  });

  it("keeps Start Parking ownership focused", () => {
    expect(metadata(StartParkingModule, MODULE_METADATA.CONTROLLERS)).toEqual([
      StartParkingController,
      ConfirmParkedController,
    ]);
    expect(metadata(StartParkingModule, MODULE_METADATA.PROVIDERS)).toEqual([
      StartParkingService,
      ConfirmParkedService,
    ]);
  });

  it("keeps Hybrid Dispatch ownership focused", () => {
    expect(metadata(DispatchModule, MODULE_METADATA.CONTROLLERS)).toEqual([
      DispatchController,
    ]);
    expect(metadata(DispatchModule, MODULE_METADATA.PROVIDERS)).toEqual([
      DispatchService,
    ]);
  });

  it("keeps guest and staff Retrieval ownership separate from Guest Access", () => {
    expect(metadata(RetrievalModule, MODULE_METADATA.CONTROLLERS)).toEqual([
      CompleteHandoffController,
      GuestRetrievalController,
      HandoffGuestController,
      HandoffStaffController,
      MarkReadyController,
      StartRetrievalController,
    ]);
    expect(metadata(RetrievalModule, MODULE_METADATA.PROVIDERS)).toEqual([
      CompleteHandoffService,
      HandoffService,
      RetrievalService,
      StaffPushOperationalPolicy,
      MarkReadyService,
      StartRetrievalService,
    ]);
  });
  it("keeps Key custody ownership focused", () => {
    expect(metadata(KeyCustodyModule, MODULE_METADATA.CONTROLLERS)).toEqual([
      KeyCustodyController,
    ]);
    expect(metadata(KeyCustodyModule, MODULE_METADATA.PROVIDERS)).toEqual([
      KeyCustodyService,
    ]);
  });
  it("keeps Shift ownership focused", () => {
    expect(metadata(ShiftModule, MODULE_METADATA.CONTROLLERS)).toEqual([
      ShiftController,
      ShiftPresenceController,
    ]);
    expect(metadata(ShiftModule, MODULE_METADATA.PROVIDERS)).toEqual([
      ShiftService,
      ShiftPresenceService,
    ]);
  });

  it("keeps Auth ownership and exports only accepted staff authority", () => {
    expect(metadata(AuthModule, MODULE_METADATA.CONTROLLERS)).toEqual([
      StaffAuthController,
      NativeStaffAuthController,
      StaffMfaController,
    ]);
    expect(metadata(AuthModule, MODULE_METADATA.EXPORTS)).toEqual([
      STAFF_PRINCIPAL_RESOLVER,
      STAFF_SESSION_CONTEXT_RESOLVER,
      MfaAssurancePolicy,
    ]);
  });

  it("keeps one Anti-Abuse provider path", () => {
    expect(metadata(AntiAbuseModule, MODULE_METADATA.IMPORTS)).toEqual([
      RuntimeDatabaseModule,
    ]);
    expect(metadata(AntiAbuseModule, MODULE_METADATA.EXPORTS)).toEqual([
      AntiAbuseKeyDeriver,
      AntiAbuseService,
      TrustedClientAddressResolver,
    ]);
  });

  it("keeps Check-In limited to staff Check-In ownership", () => {
    expect(metadata(CheckInModule, MODULE_METADATA.CONTROLLERS)).toEqual([
      StaffCheckInController,
      ReturningCheckInController,
      PlateOcrController,
    ]);
    expect(metadata(CheckInModule, MODULE_METADATA.PROVIDERS)).toEqual([
      CheckInApiService,
      CheckInOperationRunner,
      PlateOcrAuthGuard,
      PlateOcrService,
      expect.objectContaining({ provide: PlateOcrCostGuard }),
      expect.objectContaining({ provide: PLATE_OCR_PROVIDER }),
    ]);
    for (const method of [
      "executeGuestIssue",
      "executeGuestRevoke",
      "resolveGuest",
      "resolveGuestInTransaction",
    ]) {
      expect(method in CheckInApiService.prototype).toBe(false);
    }
  });
  it("keeps Staff ownership focused on operational context, session and vehicle-directory reads, and incident reporting", () => {
    expect(metadata(StaffModule, MODULE_METADATA.CONTROLLERS)).toEqual([
      StaffCheckInContinuationsController,
      StaffCheckInDraftsController,
      StaffOperationalContextController,
      StaffValetSessionController,
      IncidentReportingController,
      IncidentRecoveryController,
    ]);
    expect(metadata(StaffModule, MODULE_METADATA.PROVIDERS)).toEqual([
      StaffCheckInContinuationsService,
      StaffCheckInDraftsService,
      StaffOperationalContextService,
      StaffValetSessionService,
      StaffVehicleDirectoryService,
      IncidentReportingService,
      IncidentRecoveryService,
    ]);
  });
});
