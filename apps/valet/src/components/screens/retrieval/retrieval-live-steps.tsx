"use client";

import { useState, type JSX } from "react";
import {
  BackHeader,
  Badge,
  Btn,
  ElapsedTimer,
  InfoRow,
  SuccessCircle,
} from "../../ui/employee-primitives";

export function LiveRetrievalKeyCheckoutStep({
  expectedKey,
  isKeyConfirmed,
  isSubmitting,
  error,
  vehicleInfo,
  parkingLocation,
  onConfirmKey,
  onStartRetrieval,
  onBack,
}: {
  readonly error: string | null;
  readonly expectedKey: string | null;
  readonly isKeyConfirmed: boolean;
  readonly isSubmitting: boolean;
  readonly onBack: () => void;
  readonly onConfirmKey: (input: string) => boolean;
  readonly onStartRetrieval: () => Promise<void>;
  readonly parkingLocation: string;
  readonly vehicleInfo: string;
}): JSX.Element {
  const [inputKey, setInputKey] = useState(expectedKey ?? "");

  const handleVerify = () => {
    onConfirmKey(inputKey);
  };

  return (
    <div>
      <BackHeader title="Key Checkout" onBack={onBack} />
      <div className="p-5 space-y-5">
        {error && (
          <div className="p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
            {error}
          </div>
        )}

        <div className="bg-ice rounded-2xl p-6 text-center">
          <p className="text-neutral text-xs uppercase tracking-wider mb-2">
            Expected key slot
          </p>
          <p className="font-heading font-bold text-[48px] text-navy">
            {expectedKey ?? "N/A"}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-vborder divide-y divide-vborder">
          <InfoRow label="Vehicle" value={vehicleInfo} />
          <InfoRow label="Location" value={parkingLocation} />
        </div>

        {!isKeyConfirmed ? (
          <div className="space-y-3">
            <div>
              <label className="text-neutral text-xs font-semibold uppercase tracking-wider block mb-1">
                Enter Key Slot Code
              </label>
              <input
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                placeholder="Enter key slot code"
                className="w-full text-center font-heading font-semibold text-xl text-navy bg-white border border-vborder rounded-xl h-12 focus:outline-none focus:border-vblue"
              />
            </div>
            <Btn
              label="Verify Key Slot"
              onClick={handleVerify}
              disabled={inputKey.trim() === ""}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-[#EEFBF5] border border-vsuccess/20 rounded-xl p-4 flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-vsuccess" />
              <span className="text-vsuccess font-semibold text-sm">
                Key slot verified ({expectedKey})
              </span>
            </div>
            <Btn
              label={isSubmitting ? "Starting Retrieval..." : "Start Retrieval"}
              onClick={() => void onStartRetrieval()}
              disabled={isSubmitting}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function LiveRetrievalInProgressStep({
  vehicleHeading,
  vehicleInfo,
  keyInfo,
  parkingLocation,
  retrievalStartedAt,
  isSubmitting,
  error,
  onMarkReady,
}: {
  readonly error: string | null;
  readonly isSubmitting: boolean;
  readonly keyInfo: string;
  readonly onMarkReady: () => Promise<void>;
  readonly parkingLocation: string;
  readonly retrievalStartedAt: string | null;
  readonly vehicleHeading: string;
  readonly vehicleInfo: string;
}): JSX.Element {
  return (
    <div>
      <div className="bg-white border-b border-vborder px-5 py-4 flex items-center justify-between">
        <div>
          <Badge variant="retrieval" />
          <p className="font-heading font-bold text-xl text-navy mt-2">
            Retrieving {vehicleHeading}
          </p>
        </div>
      </div>
      <div className="p-5 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
            {error}
          </div>
        )}
        {retrievalStartedAt && (
          <div className="bg-white rounded-2xl border border-vborder p-5 flex flex-col items-center gap-1">
            <p className="text-muted text-xs uppercase tracking-wider">
              Elapsed
            </p>
            <ElapsedTimer startTimeIso={retrievalStartedAt} />
          </div>
        )}
        <div className="bg-white rounded-2xl border border-vborder divide-y divide-vborder">
          <InfoRow label="Vehicle" value={vehicleInfo} />
          <InfoRow label="Key" value={keyInfo} />
          <InfoRow label="Location" value={parkingLocation} />
        </div>
        <Btn
          label={isSubmitting ? "Marking Ready..." : "Vehicle Ready"}
          onClick={() => void onMarkReady()}
          disabled={isSubmitting}
        />
      </div>
    </div>
  );
}

export function LiveRetrievalVehicleReadyStep({
  vehicleInfo,
  keyInfo,
  parkingLocation,
  onDone,
}: {
  readonly keyInfo: string;
  readonly onDone: () => void;
  readonly parkingLocation: string;
  readonly vehicleInfo: string;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] p-6 space-y-6">
      <SuccessCircle />
      <div className="text-center">
        <p className="font-heading font-bold text-2xl text-navy">
          Vehicle ready
        </p>
        <p className="text-vsuccess text-sm font-semibold mt-1">
          Ready for guest
        </p>
      </div>
      <div className="w-full bg-white rounded-2xl border border-vborder divide-y divide-vborder">
        <InfoRow label="Vehicle" value={vehicleInfo} />
        <InfoRow label="Key" value={keyInfo} />
        <InfoRow label="Location" value={parkingLocation} />
      </div>
      <div className="w-full">
        <Btn label="Done" onClick={onDone} />
      </div>
    </div>
  );
}
