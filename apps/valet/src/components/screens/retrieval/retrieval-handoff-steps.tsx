import type { JSX } from "react";

import {
  BackHeader,
  Btn,
  InfoRow,
  SuccessCircle,
  VehicleIdentity,
} from "../../ui/employee-primitives";

export function RetrievalHandoffPinStep({
  pin,
  pinError,
  onDigitChange,
  onVerify,
  onBack,
}: {
  pin: string[];
  pinError: boolean;
  onDigitChange: (i: number, val: string) => void;
  onVerify: () => void;
  onBack: () => void;
}): JSX.Element {
  return (
    <div>
      <BackHeader title="Secure Handoff" onBack={onBack} />
      <div className="p-5 space-y-6">
        <div>
          <p className="text-navy font-semibold text-[17px]">
            Enter pickup code
          </p>
          <p className="text-neutral text-sm mt-1">
            Ask the guest for their 4-digit code
          </p>
        </div>
        <div className="bg-white rounded-xl border border-vborder p-4">
          <VehicleIdentity />
          <p className="text-neutral text-xs mt-2">Pickup: Main Entrance</p>
        </div>
        <div className="flex gap-3 justify-center">
          {pin.map((digit, i) => (
            <input
              key={i}
              type="tel"
              maxLength={1}
              value={digit}
              onChange={(e) => onDigitChange(i, e.target.value)}
              className={`w-[62px] h-[62px] text-center font-heading font-bold text-2xl border-2 rounded-2xl focus:outline-none transition-all bg-white ${
                pinError
                  ? "border-vdanger bg-[#FFF0F0] text-vdanger"
                  : digit
                    ? "border-vblue bg-ice text-navy"
                    : "border-vborder text-navy focus:border-vblue"
              }`}
            />
          ))}
        </div>
        {pinError && (
          <div className="bg-[#FFF0F0] border border-vdanger/20 rounded-xl px-4 py-3 text-center">
            <p className="text-vdanger font-semibold text-sm">
              Incorrect code — do not release the vehicle
            </p>
            <p className="text-neutral text-xs mt-0.5">
              Demo hint: correct code is 4821
            </p>
          </div>
        )}
        <Btn label="Verify" onClick={onVerify} disabled={pin.some((d) => !d)} />
        {pinError && <Btn label="Call Supervisor" variant="ghost" size="md" />}
      </div>
    </div>
  );
}

export function RetrievalGuestVerifiedStep({
  onRelease,
}: {
  onRelease: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] p-6 space-y-6">
      <SuccessCircle />
      <div className="text-center">
        <p className="font-heading font-bold text-2xl text-navy">
          Guest verified
        </p>
        <p className="text-neutral text-sm mt-1">Safe to release the vehicle</p>
      </div>
      <div className="w-full bg-white rounded-2xl border border-vborder divide-y divide-vborder">
        <InfoRow label="Vehicle" value="BMW X5 · 12-34567" />
        <InfoRow label="Pickup" value="Main Entrance" />
        <InfoRow label="Key" value="B-214" />
      </div>
      <div className="w-full">
        <Btn label="Release Vehicle" onClick={onRelease} variant="success" />
      </div>
    </div>
  );
}

export function RetrievalReleasedStep({
  onNextTask,
}: {
  onNextTask: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] p-6 space-y-6">
      <SuccessCircle size={88} />
      <div className="text-center">
        <p className="font-heading font-bold text-[26px] text-navy">
          Vehicle returned
        </p>
        <p className="text-vsuccess font-semibold text-sm mt-1.5">
          Session complete
        </p>
      </div>
      <div className="w-full bg-white rounded-2xl border border-vborder divide-y divide-vborder">
        <InfoRow label="Vehicle" value="BMW X5 · 12-34567" />
        <InfoRow label="Guest" value="Verified ✓" accent />
        <InfoRow label="Session" value="Completed 8:23 PM" />
      </div>
      <div className="w-full">
        <Btn label="Next Task" onClick={onNextTask} />
      </div>
    </div>
  );
}
