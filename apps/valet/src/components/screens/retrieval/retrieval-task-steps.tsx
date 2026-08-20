import type { JSX } from "react";

import {
  BackHeader,
  Badge,
  Btn,
  ElapsedTimer,
  InfoRow,
  TrackingPill,
  VehicleIdentity,
} from "../../ui/employee-primitives";

export function RetrievalTaskStep({
  taskAccepted,
  onAcceptTask,
  onCheckOutKey,
  onBack,
}: {
  taskAccepted: boolean;
  onAcceptTask: () => void;
  onCheckOutKey: () => void;
  onBack: () => void;
}): JSX.Element {
  return (
    <div>
      <BackHeader title="Retrieval Task" onBack={onBack} />
      <div className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <Badge variant="retrieval" />
          <span className="font-heading tabular-nums font-bold text-lg text-vdanger">
            02:14
          </span>
        </div>
        <div>
          <VehicleIdentity color="Black" />
          <p className="text-neutral text-[13px] mt-1">Requested 2 min ago</p>
        </div>
        <div className="bg-white rounded-2xl border border-vborder divide-y divide-vborder">
          <InfoRow label="Current parking" value="Zone B · Spot B-17" />
          <InfoRow label="Key" value="B-214" />
          <InfoRow label="Pickup" value="Main Entrance" />
        </div>
        {!taskAccepted ? (
          <Btn label="Accept Task" onClick={onAcceptTask} />
        ) : (
          <>
            <Btn label="Check Out Key" onClick={onCheckOutKey} />
            <Btn label="Decline" variant="ghost" size="md" />
          </>
        )}
      </div>
    </div>
  );
}

export function RetrievalKeyCheckoutStep({
  keyState,
  onScanCorrect,
  onScanWrong,
  onStartRetrieval,
  onScanAgain,
  onBack,
}: {
  keyState: "idle" | "correct" | "wrong";
  onScanCorrect: () => void;
  onScanWrong: () => void;
  onStartRetrieval: () => void;
  onScanAgain: () => void;
  onBack: () => void;
}): JSX.Element {
  return (
    <div>
      <BackHeader title="Key Checkout" onBack={onBack} />
      <div className="p-5 space-y-5">
        {keyState === "idle" && (
          <>
            <div className="bg-ice rounded-2xl p-6 text-center">
              <p className="text-neutral text-xs uppercase tracking-wider mb-2">
                Expected key
              </p>
              <p className="font-heading font-bold text-[48px] text-navy">
                B-214
              </p>
            </div>
            <Btn label="Scan key QR — correct key" onClick={onScanCorrect} />
            <Btn
              label="Scan wrong key (demo)"
              variant="secondary"
              size="md"
              onClick={onScanWrong}
            />
          </>
        )}
        {keyState === "correct" && (
          <>
            <div className="bg-[#EEFBF5] border border-vsuccess/20 rounded-2xl p-6 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-vsuccess" />
                <span className="text-vsuccess font-semibold text-sm">
                  Correct key
                </span>
              </div>
              <p className="font-heading font-bold text-[48px] text-navy">
                B-214
              </p>
            </div>
            <div className="bg-white rounded-xl border border-vborder p-4">
              <VehicleIdentity />
            </div>
            <Btn label="Start Retrieval" onClick={onStartRetrieval} />
          </>
        )}
        {keyState === "wrong" && (
          <>
            <div className="bg-[#FFF0F0] border border-vdanger/20 rounded-2xl p-5">
              <p className="text-vdanger font-bold text-base mb-4 text-center">
                Wrong key scanned
              </p>
              <div className="flex items-center justify-center gap-6">
                <div className="text-center">
                  <p className="text-muted text-xs mb-1">Expected</p>
                  <p className="font-heading font-bold text-3xl text-navy">
                    B-214
                  </p>
                </div>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12h14M14 7l5 5-5 5"
                    stroke="#D95C63"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="text-center">
                  <p className="text-muted text-xs mb-1">Scanned</p>
                  <p className="font-heading font-bold text-3xl text-vdanger">
                    C-109
                  </p>
                </div>
              </div>
            </div>
            <p className="text-neutral text-sm text-center">
              You must retrieve the correct key before proceeding.
            </p>
            <Btn
              label="Scan correct key"
              variant="danger"
              onClick={onScanAgain}
            />
          </>
        )}
      </div>
    </div>
  );
}

export function RetrievalInProgressStep({
  onVehicleReady,
  onReportIssue,
}: {
  onVehicleReady: () => void;
  onReportIssue: () => void;
}): JSX.Element {
  return (
    <div>
      <div className="bg-white border-b border-vborder px-5 py-4 flex items-center justify-between">
        <div>
          <Badge variant="retrieval" />
          <p className="font-heading font-bold text-xl text-navy mt-2">
            Retrieving vehicle
          </p>
        </div>
        <TrackingPill />
      </div>
      <div className="p-5 space-y-4">
        <div className="bg-white rounded-2xl border border-vborder p-5 flex flex-col items-center gap-1">
          <p className="text-muted text-xs uppercase tracking-wider">Elapsed</p>
          <ElapsedTimer offsetSeconds={84} />
        </div>
        <div className="bg-white rounded-2xl border border-vborder divide-y divide-vborder">
          <InfoRow label="Vehicle" value="BMW X5 · 12-34567" />
          <InfoRow label="Key" value="B-214" />
          <InfoRow label="Pickup" value="Main Entrance" />
        </div>
        <Btn label="Vehicle Ready" onClick={onVehicleReady} />
        <Btn
          label="Report Issue"
          variant="secondary"
          size="md"
          onClick={onReportIssue}
        />
      </div>
    </div>
  );
}

export function RetrievalVehicleReadyStep({
  onVerifyGuest,
}: {
  onVerifyGuest: () => void;
}): JSX.Element {
  return (
    <div>
      <div className="bg-[#EEFBF5] border-b border-vsuccess/20 px-5 py-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2 h-2 rounded-full bg-vsuccess animate-pulse" />
          <span className="text-vsuccess font-bold text-sm">Vehicle ready</span>
        </div>
        <VehicleIdentity />
        <p className="text-neutral text-sm mt-1">
          Main Entrance · Guest notified
        </p>
      </div>
      <div className="p-5 space-y-5">
        <div className="bg-ice rounded-xl px-4 py-3.5">
          <p className="text-vblue font-semibold text-sm">
            Next: Secure Handoff
          </p>
          <p className="text-neutral text-xs mt-0.5">
            Verify guest identity before releasing the vehicle
          </p>
        </div>
        <Btn label="Verify Guest" onClick={onVerifyGuest} />
      </div>
    </div>
  );
}
