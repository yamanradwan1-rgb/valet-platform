import type { JSX } from "react";
import type {
  StaffCheckInContinuationSummary,
  StaffCheckInDraftSummary,
} from "@valet/contracts";
import { BackHeader, Btn } from "../../ui/employee-primitives";
import { useEmployeeI18n } from "../../shell/employee-i18n";

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
  const { t } = useEmployeeI18n();
  return (
    <div>
      <BackHeader title={t.recoverableSessions} onBack={onBack} />
      <div className="p-5 space-y-4">
        <p className="text-neutral text-xs font-semibold uppercase tracking-wider">
          {t.multipleCheckIns}
        </p>
        {drafts.map((draft) => (
          <div
            key={draft.sessionId}
            onClick={() => onResumeDraft(draft)}
            className="bg-white rounded-2xl border border-vborder p-4 cursor-pointer hover:border-vblue transition-colors shadow-sm"
          >
            <span className="text-[10px] font-bold uppercase text-vblue bg-ice px-2 py-0.5 rounded">
              {t.draft}
            </span>
            <p className="font-heading font-bold text-navy text-base mt-2">
              {draft.vehicle.make ?? t.vehicle} {draft.vehicle.model ?? ""}
            </p>
            <p className="text-neutral text-xs">
              {draft.vehicle.plateNumberRaw ??
                draft.vehicle.temporaryDescriptor ??
                t.noPlateTitle}
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
              {t.awaitingParking}
            </span>
            <p className="font-heading font-bold text-navy text-base mt-2">
              {cont.vehicle.make ?? t.vehicle} {cont.vehicle.model ?? ""}
            </p>
            <p className="text-neutral text-xs">
              {cont.vehicle.plateNumberRaw ??
                cont.vehicle.temporaryDescriptor ??
                t.noPlateTitle}
            </p>
          </div>
        ))}
        <Btn label={t.backToQueue} variant="secondary" onClick={onBack} />
      </div>
    </div>
  );
}
