import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StaffTaskQueueItem, StaffValetSessionDetailResponse } from "@valet/contracts";

import { CheckInManualPlateStep } from "../../components/screens/check-in/check-in-plate-steps";
import { IncidentLiveForm } from "../../components/screens/incident-live-form";
import { ParkingFlow } from "../../components/screens/parking-flow";
import {
  LiveHandoffPendingStep,
  LiveReadyHandoffLaunchStep,
} from "../../components/screens/retrieval/retrieval-handoff-live-steps";
import { LiveHandoffVerifiedStep } from "../../components/screens/retrieval/retrieval-handoff-live-release-steps";
import { LiveRetrievalInProgressStep } from "../../components/screens/retrieval/retrieval-live-steps";
import { TaskQueueScreen } from "../../components/screens/task-queue-screen";
import {
  EmployeeI18nProvider,
  useEmployeeI18n,
} from "../../components/shell/employee-i18n";

function DirectionBoundary({ children }: { children: ReactNode }): ReactNode {
  const { dir } = useEmployeeI18n();
  return <div dir={dir}>{children}</div>;
}

function renderArabic(children: ReactNode): string {
  return renderToStaticMarkup(
    <EmployeeI18nProvider initialLocale="ar">
      <DirectionBoundary>{children}</DirectionBoundary>
    </EmployeeI18nProvider>,
  );
}

const detail: StaffValetSessionDetailResponse = {
  checkIn: { conditionCompletedAt: "2026-08-22T09:00:00.000Z" },
  handoff: { pendingAt: null, verification: null },
  keySlot: { code: "K-01" },
  locationId: "33333333-3333-4333-8333-333333333333",
  parking: {
    parkedAt: "2026-08-22T09:05:00.000Z",
    parkingSpotCode: "P-101",
    parkingStartedAt: "2026-08-22T09:02:00.000Z",
    parkingZoneCode: "Z-A",
  },
  sessionId: "11111111-1111-4111-8111-111111111111",
  state: "READY",
  vehicle: {
    color: "Black",
    make: "Audi",
    model: "A6",
    plateCountry: "JO",
    plateNumberRaw: "77-99999",
    temporaryDescriptor: null,
    vehicleId: "44444444-4444-4444-8444-444444444444",
    vehicleUpdatedAt: "2026-08-22T09:00:00.000Z",
  },
  version: 9,
};

const task: StaffTaskQueueItem = {
  createdAt: "2026-08-21T18:00:00.000Z",
  currentAssigneeMembershipId: null,
  parkingSpot: "P-101",
  parkingZone: "Z-A",
  retrievalRequestedAt: "2026-08-21T18:05:00.000Z",
  sessionId: detail.sessionId,
  status: "IN_PROGRESS",
  taskId: "22222222-2222-4222-8222-222222222222",
  taskType: "RETRIEVAL",
  valetSessionState: "HANDOFF_PENDING",
  valetSessionVersion: 9,
  vehicle: detail.vehicle,
  version: 6,
};

describe("live Employee Arabic rendering", () => {
  it("renders the real Arabic Task Queue within an RTL provider", () => {
    const markup = renderArabic(
      <TaskQueueScreen
        initialTasks={[task]}
        locationId="loc-ar-test"
        locationName="موقع الاختبار"
        membershipId="mem-1"
        mode="live"
        role="VALET_EMPLOYEE"
      />,
    );
    expect(markup).toContain('dir="rtl"');
    expect(markup).toContain("المهام");
    expect(markup).toContain("مركبة جديدة");
    expect(markup).toContain("المناوبة نشطة");
    expect(markup).toContain('<bdi dir="ltr">77-99999</bdi>');
  });

  it("renders Arabic Check-In and Parking actions with LTR codes", () => {
    const checkIn = renderArabic(
      <CheckInManualPlateStep
        onBack={vi.fn()}
        onChangePlateCountry={vi.fn()}
        onChangePlateNumber={vi.fn()}
        onContinue={vi.fn()}
        onNoPlate={vi.fn()}
        plateCountry="JO"
        plateNumber="77-99999"
      />,
    );
    expect(checkIn).toContain("إدخال اللوحة");
    expect(checkIn).toContain('dir="ltr"');

    const parking = renderArabic(
      <ParkingFlow
        initialSession={{
          keySlotCode: "K-01",
          locationId: detail.locationId,
          parkedAt: null,
          parkingSpotCode: "P-101",
          parkingStartedAt: "2026-08-22T09:02:00.000Z",
          parkingZoneCode: "Z-A",
          sessionId: detail.sessionId,
          sessionVersion: 9,
          taskId: task.taskId,
          taskVersion: 6,
          vehicle: detail.vehicle,
        }}
        mode="live"
        nav={vi.fn()}
      />,
    );
    expect(parking).toContain("اركن المركبة");
    expect(parking).toContain('<bdi dir="ltr">K-01</bdi>');
    expect(parking).toContain('<bdi dir="ltr">المنطقة Z-A</bdi>');
  });

  it("renders Arabic Retrieval and both Handoff proof states", () => {
    const retrieval = renderArabic(
      <LiveRetrievalInProgressStep
        error={null}
        isSubmitting={false}
        keyInfo="K-01"
        onMarkReady={vi.fn()}
        onReportIssue={vi.fn()}
        parkingLocation="Z-A · P-101"
        retrievalStartedAt={null}
        vehicleHeading="Audi A6"
        vehicleInfo="Audi A6 · 77-99999"
      />,
    );
    expect(retrieval).toContain("استرجاع");
    expect(retrieval).toContain("الإبلاغ عن مشكلة");
    expect(retrieval).toContain('<bdi dir="ltr">Z-A · P-101</bdi>');

    const pending = renderArabic(
      <LiveHandoffPendingStep
        abortError={null}
        error={null}
        isMutating={false}
        isSupervisor={false}
        onAbort={vi.fn()}
        onOpenIncident={vi.fn()}
        onOverride={vi.fn()}
        onVerifyPickupCode={vi.fn()}
        onVerifyQrPayload={vi.fn()}
        retryAfterSeconds={null}
        vehicleInfo="Audi A6 · 77-99999"
      />,
    );
    expect(pending).toContain("في انتظار إثبات الضيف");
    expect(pending).toContain('dir="ltr"');
    expect(pending).toContain('placeholder="0000"');

    const verified = renderArabic(
      <LiveHandoffVerifiedStep
        canRelease
        error={null}
        financialBlocked={false}
        isReleasing={false}
        onOpenIncident={vi.fn()}
        onRelease={vi.fn()}
        verification={{
          method: "PICKUP_CODE",
          status: "VERIFIED",
          verifiedAt: "2026-08-22T10:00:00.000Z",
        }}
        vehicleInfo="Audi A6 · 77-99999"
      />,
    );
    expect(verified).toContain("تم التحقق من الهوية");
    expect(verified).toContain("تسليم المركبة");
  });

  it("renders Arabic READY launch and Incident enum presentation", () => {
    const ready = renderArabic(
      <LiveReadyHandoffLaunchStep
        error={null}
        isInitiating={false}
        keyInfo="K-01"
        onBeginHandoff={vi.fn()}
        onOpenIncident={vi.fn()}
        vehicleInfo="Audi A6 · 77-99999"
      />,
    );
    expect(ready).toContain("بدء تسليم الضيف");
    expect(ready).toContain("الإبلاغ عن مشكلة");

    const incident = renderArabic(
      <IncidentLiveForm
        detail={detail}
        onSubmit={vi.fn()}
        state={{ error: null, phase: "idle", report: null }}
      />,
    );
    expect(incident).toContain("ضرر بالمركبة");
    expect(incident).toContain("الأهمية");
    expect(incident).toContain('<bdi dir="ltr">11111111</bdi>');
  });
});
