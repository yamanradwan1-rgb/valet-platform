"use client";

import { useState, type JSX } from "react";
import type { Screen } from "../../types/employee-ui";
import {
  useParking,
  type ActiveParkingSession,
} from "../../features/parking";
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

export interface ParkingFlowProps {
  readonly initialSession?: ActiveParkingSession | null | undefined;
  readonly nav: (s: Screen) => void;
  readonly onComplete?: (() => void) | undefined;
  readonly sessionId?: string | null | undefined;
  readonly taskId?: string | null | undefined;
  readonly taskVersion?: number | null | undefined;
}

export function ParkingFlow({
  nav,
  initialSession = null,
  sessionId = null,
  taskId = null,
  taskVersion = null,
  onComplete,
}: ParkingFlowProps): JSX.Element | null {
  const parking = useParking({
    initialSession,
    sessionId,
    taskId,
    taskVersion,
  });

  const [spotScanned, setSpotScanned] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState("B-17");

  const session = parking.activeSession;
  const vehicle = session?.vehicle;

  const vehicleHeading = vehicle
    ? `${vehicle.make ?? ""} ${vehicle.model ?? "Vehicle"}`.trim()
    : "Vehicle";

  const vehiclePlate =
    vehicle?.plateNumberRaw ??
    vehicle?.temporaryDescriptor ??
    "No Plate";

  const vehicleInfo = `${vehicleHeading} · ${vehiclePlate}`;
  const keyInfo = session?.keySlotCode ?? "None";
  const destination = session?.parkingZoneCode ?? "Zone B";

  if (parking.isHydrating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6 space-y-4">
        <div className="w-8 h-8 border-4 border-vblue border-t-transparent rounded-full animate-spin" />
        <p className="text-navy font-semibold text-sm">
          Loading parking session details...
        </p>
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
              Parking {vehicleHeading}
            </p>
          </div>
          <TrackingPill />
        </div>
        <div className="p-5 space-y-4">
          {parking.error && (
            <div className="p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
              {parking.error}
            </div>
          )}
          <div className="bg-white rounded-2xl border border-vborder p-5 flex flex-col items-center gap-1">
            <p className="text-muted text-xs uppercase tracking-wider">
              Elapsed
            </p>
            <ElapsedTimer startTimeIso={session?.parkingStartedAt} />
          </div>
          <div className="bg-white rounded-2xl border border-vborder divide-y divide-vborder">
            <InfoRow label="Vehicle" value={vehicleInfo} />
            <InfoRow label="Key" value={keyInfo} />
            <InfoRow label="Destination" value={destination} />
          </div>
          <Btn
            label="Park Vehicle"
            onClick={() => parking.setStep("spot-scan")}
          />
          <Btn
            label="Report Issue"
            variant="secondary"
            size="md"
            onClick={() => nav("incident")}
          />
        </div>
      </div>
    );
  }

  if (parking.step === "spot-scan") {
    return (
      <div>
        <BackHeader
          title="Parking Spot"
          onBack={() => parking.setStep("in-progress")}
        />
        {parking.error && (
          <div className="mx-5 mt-3 p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
            {parking.error}
          </div>
        )}
        {!spotScanned ? (
          <>
            <ScannerFrame
              label="Scan parking spot QR"
              sublabel="Or choose manually below"
            />
            <div className="p-5 space-y-3">
              <Btn
                label="Simulate Spot Scan"
                onClick={() => {
                  setSelectedSpot("B-17");
                  setSpotScanned(true);
                }}
              />
              <Btn
                label="Choose manually"
                variant="secondary"
                onClick={() => {
                  setSelectedSpot("B-17");
                  setSpotScanned(true);
                }}
              />
            </div>
          </>
        ) : (
          <div className="p-5 space-y-5">
            <div className="bg-[#EEFBF5] border border-vsuccess/20 rounded-2xl p-5 text-center">
              <p className="text-muted text-xs font-semibold uppercase tracking-wider mb-2">
                Confirmed location
              </p>
              <p className="font-heading font-bold text-3xl text-navy">
                {destination}
              </p>
              <div className="mt-2">
                <label className="text-neutral text-xs font-semibold uppercase tracking-wider block mb-1">
                  Spot Code
                </label>
                <input
                  value={selectedSpot}
                  onChange={(e) => setSelectedSpot(e.target.value)}
                  placeholder="B-17"
                  className="w-full text-center font-heading font-semibold text-xl text-navy bg-white border border-vborder rounded-xl h-12 focus:outline-none focus:border-vblue"
                />
              </div>
            </div>
            <Btn
              label={
                parking.isSubmitting ? "Confirming..." : "Confirm Parking"
              }
              onClick={async () => {
                await parking.confirmParked(selectedSpot);
              }}
              variant="success"
              disabled={parking.isSubmitting || selectedSpot.trim() === ""}
            />
            <Btn
              label="Scan again"
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

  if (parking.step === "success") {
    const confirmedZone = session?.parkingZoneCode ?? destination;
    const confirmedSpot = session?.parkingSpotCode ?? selectedSpot;
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] p-6 space-y-6">
        <SuccessCircle />
        <div className="text-center">
          <p className="font-heading font-bold text-2xl text-navy">
            Vehicle parked
          </p>
          <p className="text-vsuccess text-sm font-semibold mt-1">
            Tracking stopped · Guest notified
          </p>
        </div>
        <div className="w-full bg-white rounded-2xl border border-vborder divide-y divide-vborder">
          <InfoRow label="Vehicle" value={vehicleInfo} />
          <InfoRow
            label="Zone / Spot"
            value={`${confirmedZone} · ${confirmedSpot}`}
          />
          <InfoRow label="Key" value={keyInfo} />
        </div>
        <div className="w-full">
          <Btn
            label="Done"
            onClick={() => {
              if (onComplete) {
                onComplete();
              }
              nav("task-queue");
            }}
          />
        </div>
      </div>
    );
  }

  return null;
}
