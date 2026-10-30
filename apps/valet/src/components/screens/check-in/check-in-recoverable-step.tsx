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
  readonly onResumeContinuation: (
    cont: StaffCheckInContinuationSummary,
  ) => void;
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
          <button
            key={draft.sessionId}
            type="button"
            onClick={() => onResumeDraft(draft)}
            className="block w-full text-start bg-white rounded-2xl border border-vborder p-4 cursor-pointer hover:border-vblue transition-colors shadow-sm"
          >
            <span className="text-[10px] font-bold uppercase text-vblue bg-ice px-2 py-0.5 rounded">
              {t.draft}
            </span>
            <span className="block font-heading font-bold text-navy text-base mt-2">
              {draft.vehicle.make ?? t.vehicle} {draft.vehicle.model ?? ""}
            </span>
            <span className="block text-neutral text-xs">
              {draft.vehicle.plateNumberRaw ??
                draft.vehicle.temporaryDescriptor ??
                t.noPlateTitle}
            </span>
          </button>
        ))}
        {continuations.map((cont) => (
          <button
            key={cont.sessionId}
            type="button"
            onClick={() => onResumeContinuation(cont)}
            className="block w-full text-start bg-white rounded-2xl border border-vborder p-4 cursor-pointer hover:border-vblue transition-colors shadow-sm"
          >
            <span className="text-[10px] font-bold uppercase text-vsuccess bg-green-50 px-2 py-0.5 rounded">
              {t.awaitingParking}
            </span>
            <span className="block font-heading font-bold text-navy text-base mt-2">
              {cont.vehicle.make ?? t.vehicle} {cont.vehicle.model ?? ""}
            </span>
            <span className="block text-neutral text-xs">
              {cont.vehicle.plateNumberRaw ??
                cont.vehicle.temporaryDescriptor ??
                t.noPlateTitle}
            </span>
          </button>
        ))}
        <Btn label={t.backToQueue} variant="secondary" onClick={onBack} />
      </div>
    </div>
  );
}
