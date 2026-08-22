import type { JSX } from "react";
import type {
  StaffCheckInContinuationSummary,
  StaffCheckInDraftSummary,
} from "@valet/contracts";
import { BackHeader, Btn } from "../../ui/employee-primitives";

export function CheckInRecoverableStep({
  drafts,
  continuations,
  onResumeDraft,
  onResumeContinuation,
  onBack,
}: {
  readonly continuations: StaffCheckInContinuationSummary[];
  readonly drafts: StaffCheckInDraftSummary[];
  readonly onBack: () => void;
  readonly onResumeContinuation: (cont: StaffCheckInContinuationSummary) => void;
  readonly onResumeDraft: (draft: StaffCheckInDraftSummary) => void;
}): JSX.Element {
  return (
    <div>
      <BackHeader title="Recoverable Sessions" onBack={onBack} />
      <div className="p-5 space-y-4">
        <p className="text-neutral text-xs font-semibold uppercase tracking-wider">
          Multiple Incomplete Check-Ins Found
        </p>
        {drafts.map((draft) => (
          <div
            key={draft.sessionId}
            onClick={() => onResumeDraft(draft)}
            className="bg-white rounded-2xl border border-vborder p-4 cursor-pointer hover:border-vblue transition-colors shadow-sm"
          >
            <span className="text-[10px] font-bold uppercase text-vblue bg-ice px-2 py-0.5 rounded">
              Draft
            </span>
            <p className="font-heading font-bold text-navy text-base mt-2">
              {draft.vehicle.make ?? "Vehicle"} {draft.vehicle.model ?? ""}
            </p>
            <p className="text-neutral text-xs">
              {draft.vehicle.plateNumberRaw ??
                draft.vehicle.temporaryDescriptor ??
                "No Plate"}
            </p>
          </div>
        ))}
        {continuations.map((cont) => (
          <div
            key={cont.sessionId}
            onClick={() => onResumeContinuation(cont)}
            className="bg-white rounded-2xl border border-vborder p-4 cursor-pointer hover:border-vblue transition-colors shadow-sm"
          >
            <span className="text-[10px] font-bold uppercase text-vsuccess bg-green-50 px-2 py-0.5 rounded">
              Awaiting Parking
            </span>
            <p className="font-heading font-bold text-navy text-base mt-2">
              {cont.vehicle.make ?? "Vehicle"} {cont.vehicle.model ?? ""}
            </p>
            <p className="text-neutral text-xs">
              {cont.vehicle.plateNumberRaw ??
                cont.vehicle.temporaryDescriptor ??
                "No Plate"}
            </p>
          </div>
        ))}
        <Btn label="Back to Task Queue" variant="secondary" onClick={onBack} />
      </div>
    </div>
  );
}
