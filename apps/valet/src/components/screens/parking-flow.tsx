"use client";

import { useState, type JSX } from "react";
import type { Screen } from "../../types/employee-ui";
import { presentLiveError } from "../../lib/i18n/live-presentation";
import {
  useParking,
  type ActiveParkingSession,
} from "../../features/parking";
import { useOnlineStatus } from "../../lib/connectivity/use-online-status";
import { ParkingKeyReturnStep } from "./parking-key-return-step";
import {
  BackHeader,
  Badge,
  Btn,
  ElapsedTimer,
  InfoRow,
  ScannerFrame,
  SuccessCircle,
  TrackingPill,
} from "../ui/employee-primitives";
import { useEmployeeI18n } from "../shell/employee-i18n";

export interface ParkingFlowProps {
  readonly initialSession?: ActiveParkingSession | null | undefined;
  readonly mode?: "live" | "prototype" | undefined;
  readonly nav: (s: Screen) => void;
  readonly onAuthorizationLoss?: (() => void) | undefined;
  readonly onComplete?: (() => void) | undefined;
  readonly onReportIssue?: (() => void) | undefined;
  readonly sessionId?: string | null | undefined;
  readonly taskId?: string | null | undefined;
  readonly taskVersion?: number | null | undefined;
}

export function ParkingFlow({
  nav,
  initialSession = null,
  mode = "live",
  sessionId = null,
  taskId = null,
  taskVersion = null,
  onAuthorizationLoss,

  onComplete,

  onReportIssue,
}: ParkingFlowProps): JSX.Element | null {
  const { locale, t } = useEmployeeI18n();
  const parking = useParking({
    initialSession,
    onAuthorizationLoss,
    sessionId,
    taskId,
    taskVersion,
  });

  const [spotScanned, setSpotScanned] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState("");
  const [selectedKeySlot, setSelectedKeySlot] = useState("");
  const isOnline = useOnlineStatus();

  const session = parking.activeSession;
  const vehicle = session?.vehicle;

  const vehicleHeading = vehicle
    ? `${vehicle.make ?? ""} ${vehicle.model ?? t.vehicle}`.trim() || t.vehicle
    : t.vehicle;

  const vehiclePlate =
    vehicle?.plateNumberRaw ??
    vehicle?.temporaryDescriptor ??
    t.noPlateTitle;

  const keyInfo = session?.keySlotCode ?? t.notAssigned;
  const destination = session?.parkingZoneCode ? `${t.zone} ${session.parkingZoneCode}` : t.parkingArea;
  const liveError = parking.error
    ? presentLiveError(new Error(parking.error), locale, t)
    : null;

  if (parking.isHydrating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6 space-y-4">
        <div className="w-8 h-8 border-4 border-vblue border-t-transparent rounded-full animate-spin" />
        <p className="text-navy font-semibold text-sm">
          {t.loadingParking}
        </p>
      </div>
    );
  }

  if (parking.error && !session) {
    return (
      <div>
        <BackHeader title={t.parkingOperation} onBack={() => nav("task-queue")} />
        <div className="p-5 space-y-4">
          <div className="p-4 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-sm">
            <p className="font-bold">{t.cannotResumeParking}</p>
            <p className="text-xs mt-1">{liveError}</p>
          </div>
          <Btn label={t.retry} onClick={() => void parking.retry()} />
          <Btn label={t.backToQueue} variant="secondary" onClick={() => nav("task-queue")} />
        </div>
      </div>
    );
  }

  if (parking.step === "in-progress") {
    return (
      <div>
        <div className="bg-white border-b border-vborder px-5 py-4 flex items-center justify-between">
          <div>
            <Badge variant="parking" />
            <p className="font-heading font-bold text-xl text-navy mt-2">
              {t.parkingState} {vehicleHeading}
            </p>
          </div>
          {mode === "prototype" && <TrackingPill />}
        </div>
        <div className="p-5 space-y-4">
          {parking.error && (
            <div className="p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
              {liveError}
            </div>
          )}
          <div className="bg-white rounded-2xl border border-vborder p-5 flex flex-col items-center gap-1">
            <p className="text-muted text-xs uppercase tracking-wider">
              {t.elapsed}
            </p>
            <ElapsedTimer startTimeIso={session?.parkingStartedAt} />
          </div>
          <div className="bg-white rounded-2xl border border-vborder divide-y divide-vborder">
            <InfoRow label={t.vehicle} value={<>{vehicleHeading} · <bdi dir="ltr">{vehiclePlate}</bdi></>} />
            <InfoRow label={t.key} value={<bdi dir="ltr">{keyInfo}</bdi>} />
            <InfoRow label={t.destination} value={<bdi dir="ltr">{destination}</bdi>} />
          </div>
          <Btn
            label={t.parkVehicle}
            onClick={() => parking.setStep("spot-scan")}
          />
          {mode === "live" && onReportIssue && (
            <Btn label={t.reportIssue} variant="secondary" onClick={onReportIssue} />
          )}
          {mode === "prototype" && (
            <Btn
              label="Report Issue"
              variant="secondary"
              size="md"
              onClick={() => nav("incident")}
            />
          )}
        </div>
      </div>
    );
  }

  if (parking.step === "spot-scan") {
    return (
      <div>
        <BackHeader
          title={t.parkingSpot}
          onBack={() => parking.setStep("in-progress")}
        />
        {parking.error && (
          <div className="mx-5 mt-3 p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
            {liveError}
          </div>
        )}
        {!spotScanned ? (
          <>
            <ScannerFrame
              label={t.scanParkingQr}
              sublabel={t.chooseManually}
            />
            <div className="p-5 space-y-3">
              {mode === "prototype" && (
                <Btn
                  label={t.simulateSpotScan}
                  onClick={() => {
                    setSelectedSpot("P-101");
                    setSpotScanned(true);
                  }}
                />
              )}
              <Btn
                label={t.enterSpotManually}
                variant={mode === "prototype" ? "secondary" : "primary"}
                onClick={() => setSpotScanned(true)}
              />
            </div>
          </>
        ) : (
          <div className="p-5 space-y-5">
            <div className="bg-[#EEFBF5] border border-vsuccess/20 rounded-2xl p-5 text-center">
              <p className="text-muted text-xs font-semibold uppercase tracking-wider mb-2">
                {t.location}
              </p>
              <p className="font-heading font-bold text-3xl text-navy">
                <bdi dir="ltr">{destination}</bdi>
              </p>
              <div className="mt-2">
                <label className="text-neutral text-xs font-semibold uppercase tracking-wider block mb-1">
                  {t.spotCode}
                </label>
                <input
                  value={selectedSpot}
                  dir="ltr"
                  onChange={(e) => setSelectedSpot(e.target.value)}
                  placeholder={t.enterSpotCode}
                  className="w-full text-center font-heading font-semibold text-xl text-navy bg-white border border-vborder rounded-xl h-12 focus:outline-none focus:border-vblue"
                />
              </div>
            </div>
            <Btn
              label={t.continueLabel}
              onClick={() => parking.setStep("key-return")}
              variant="success"
              disabled={!isOnline || selectedSpot.trim() === ""}
            />
            <Btn
              label={t.scanAgain}
              variant="secondary"
              size="md"
              onClick={() => setSpotScanned(false)}
              disabled={parking.isSubmitting}
            />
          </div>
        )}
      </div>
    );
  }

  if (parking.step === "key-return") {
    return (
      <ParkingKeyReturnStep
        assignedKeySlotCode={session?.keySlotCode ?? null}
        error={parking.error}
        isOnline={isOnline}
        isSubmitting={parking.isSubmitting}
        keySlotCodeInput={selectedKeySlot}
        mode={mode}
        onChangeKeySlotCode={setSelectedKeySlot}
        onBack={() => parking.setStep("spot-scan")}
        onConfirm={async () => {
          await parking.confirmParked(selectedSpot, selectedKeySlot);
        }}
      />
    );
  }

  if (parking.step === "success") {
    const confirmedZone = session?.parkingZoneCode ? `${t.zone} ${session.parkingZoneCode}` : "";
    const confirmedSpot = session?.parkingSpotCode ?? selectedSpot;
    const spotDisplay = confirmedZone ? `${confirmedZone} · ${t.spot} ${confirmedSpot}` : `${t.spot} ${confirmedSpot}`;

    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] p-6 space-y-6">
        <SuccessCircle />
        <div className="text-center">
          <p className="font-heading font-bold text-2xl text-navy">
            {t.vehicleParkedAndKeyReturned}
          </p>
          <p className="text-vsuccess text-sm font-semibold mt-1">
            {mode === "prototype"
              ? "Tracking stopped · Guest notified"
              : t.parkingConfirmed}
          </p>
        </div>
        <div className="w-full bg-white rounded-2xl border border-vborder divide-y divide-vborder">
          <InfoRow label={t.vehicle} value={<>{vehicleHeading} · <bdi dir="ltr">{vehiclePlate}</bdi></>} />
          <InfoRow label={t.location} value={<bdi dir="ltr">{spotDisplay}</bdi>} />
          <InfoRow label={t.key} value={<bdi dir="ltr">{keyInfo}</bdi>} />
        </div>
        <div className="w-full">
          <Btn
            label={t.done}
            onClick={() => {
              onComplete?.();
              nav("task-queue");
            }}
          />
        </div>
      </div>
    );
  }

  return null;
}
