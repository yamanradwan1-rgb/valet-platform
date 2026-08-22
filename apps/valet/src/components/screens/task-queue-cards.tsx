import type { JSX } from "react";
import type { StaffTaskQueueItemViewModel } from "../../features/task-queue/task-queue-view-model";
import { ChevronRight } from "../icons/employee-icons";
import { Badge, VehicleIdentity } from "../ui/employee-primitives";

/**
 * Sole gate for the card/container-level normal action. The supervisor
 * override entry NEVER opens this path: only the explicit "Override
 * Handoff" button may navigate, so an eligible card's container stays
 * non-navigating exactly like any other assigned-to-other task.
 */
export function containerAllowsNormalAction(input: {
  readonly isActionInFlight: boolean;
  readonly isAssignedToOther: boolean;
}): boolean {
  return !input.isActionInFlight && !input.isAssignedToOther;
}

export function LivePriorityTaskCard({
  priorityTask,
  membershipId,
  isActionInFlight = false,
  onAction,
  onOverrideHandoff,
  role,
}: {
  readonly isActionInFlight?: boolean | undefined;
  readonly membershipId?: string | undefined;
  readonly onAction: () => void;
  readonly onOverrideHandoff?: (() => void) | undefined;
  readonly priorityTask: StaffTaskQueueItemViewModel;
  readonly role?: "VALET_SUPERVISOR" | "VALET_EMPLOYEE" | null | undefined;
}): JSX.Element {
  const isAssignedToOther =
    priorityTask.currentAssigneeMembershipId !== null &&
    membershipId !== undefined &&
    priorityTask.currentAssigneeMembershipId !== membershipId;

  // Narrow supervisor affordance: ONLY a RETRIEVAL task that is already
  // IN_PROGRESS against a HANDOFF_PENDING session, even when assigned to
  // another employee. No other assigned-to-other task becomes clickable.
  const supervisorOverrideEligible =
    role === "VALET_SUPERVISOR" &&
    priorityTask.taskType === "RETRIEVAL" &&
    priorityTask.status === "IN_PROGRESS" &&
    priorityTask.valetSessionState === "HANDOFF_PENDING" &&
    isAssignedToOther;

  const containerNavigates = containerAllowsNormalAction({
    isActionInFlight,
    isAssignedToOther,
  });
  const isDisabled = (isAssignedToOther && !supervisorOverrideEligible) || isActionInFlight;

  let buttonText = "Accept Task";
  if (isActionInFlight) {
    buttonText = "Processing...";
  } else if (priorityTask.taskType === "PARKING") {
    if (isAssignedToOther) {
      buttonText = "Assigned";
    } else if (priorityTask.status === "QUEUED") {
      buttonText = "Claim & Park";
    } else if (priorityTask.status === "ASSIGNED") {
      buttonText = "Accept & Park";
    } else if (priorityTask.status === "ACCEPTED") {
      buttonText = "Start Parking";
    } else if (priorityTask.status === "IN_PROGRESS") {
      buttonText = "Continue Parking";
    }
  } else if (priorityTask.taskType === "RETRIEVAL") {
    if (isAssignedToOther) {
      buttonText = "Assigned";
    } else if (priorityTask.status === "QUEUED") {
      buttonText = "Accept Task";
    } else if (priorityTask.status === "ASSIGNED") {
      buttonText = "Accept Task";
    } else if (priorityTask.status === "ACCEPTED") {
      buttonText = "Open Retrieval";
    } else if (priorityTask.status === "IN_PROGRESS") {
      buttonText = "Continue Retrieval";
    }
  }

  return (
    <div
      onClick={containerNavigates ? onAction : undefined}
      className={
        !isAssignedToOther
          ? "bg-white rounded-2xl border border-vborder overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-shadow"
          : "bg-white rounded-2xl border border-vborder overflow-hidden opacity-75 shadow-sm transition-shadow"
      }
    >
      <div className="h-1 bg-vblue" />
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <Badge variant={priorityTask.badgeVariant} />
          <div className="text-right">
            <p className="text-[10px] text-neutral font-semibold uppercase tracking-wider">
              AGE
            </p>
            <span className="font-heading tabular-nums text-xl font-bold text-vdanger">
              {priorityTask.elapsedAge}
            </span>
          </div>
        </div>
        <VehicleIdentity
          model={priorityTask.vehicleHeading}
          plate={priorityTask.vehicleIdentifier}
          color={priorityTask.vehicleColor}
        />
        <p className="text-neutral text-[13px] mt-1.5">
          {priorityTask.timeText}
        </p>
        <div className="mt-4 pt-4 border-t border-vborder flex items-center justify-between">
          <div>
            <p className="text-[10px] text-neutral uppercase tracking-wider">
              STATUS
            </p>
            <p className="text-navy font-semibold text-sm mt-0.5">
              {priorityTask.status}
            </p>
          </div>
          {supervisorOverrideEligible ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isActionInFlight) return;
                onOverrideHandoff?.();
              }}
              className="bg-vdanger text-white text-sm font-bold h-10 px-4 rounded-xl cursor-pointer active:scale-[0.98] transition-all"
            >
              Override Handoff
            </button>
          ) : (
            <button
              type="button"
              disabled={isDisabled}
              onClick={(e) => {
                e.stopPropagation();
                if (!isDisabled) onAction();
              }}
              className={`${
                isDisabled
                  ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                  : priorityTask.status === "ACCEPTED" || priorityTask.status === "IN_PROGRESS"
                    ? "bg-vsuccess text-white cursor-pointer active:scale-[0.98]"
                    : "bg-vblue text-white cursor-pointer active:scale-[0.98]"
              } text-sm font-bold h-10 px-4 rounded-xl transition-all`}
            >
              {buttonText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function LiveQueueItem({
  task,
  membershipId,
  isActionInFlight = false,
  onClick,
  onOverrideHandoff,
  role,
}: {
  readonly isActionInFlight?: boolean | undefined;
  readonly membershipId?: string | undefined;
  readonly onClick?: () => void;
  readonly onOverrideHandoff?: (() => void) | undefined;
  readonly role?: "VALET_SUPERVISOR" | "VALET_EMPLOYEE" | null | undefined;
  readonly task: StaffTaskQueueItemViewModel;
}): JSX.Element {
  const isAssignedToOther =
    task.currentAssigneeMembershipId !== null &&
    membershipId !== undefined &&
    task.currentAssigneeMembershipId !== membershipId;

  const supervisorOverrideEligible =
    role === "VALET_SUPERVISOR" &&
    task.taskType === "RETRIEVAL" &&
    task.status === "IN_PROGRESS" &&
    task.valetSessionState === "HANDOFF_PENDING" &&
    isAssignedToOther;

  const containerNavigates = containerAllowsNormalAction({
    isActionInFlight,
    isAssignedToOther,
  });

  return (
    <div
      onClick={containerNavigates ? onClick : undefined}
      className={
        !isAssignedToOther
          ? "bg-white rounded-xl border border-vborder px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
          : "bg-white rounded-xl border border-vborder px-4 py-3 flex items-center gap-3 opacity-60 cursor-not-allowed transition-colors"
      }
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant={task.badgeVariant} />
          <span className="text-muted text-xs">{task.timeText}</span>
          {isAssignedToOther && (
            <span className="text-[10px] bg-gray-100 text-neutral px-1.5 py-0.5 rounded font-medium">
              Other staff
            </span>
          )}
        </div>
        <p className="font-heading font-bold text-navy text-[15px] leading-tight">
          {task.vehicleHeading}
        </p>
        <p className="text-neutral text-xs mt-0.5">
          {task.vehicleIdentifier} · {task.metaText}
        </p>
      </div>
      {supervisorOverrideEligible ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (isActionInFlight) return;
            onOverrideHandoff?.();
          }}
          className="bg-vdanger text-white text-xs font-bold h-9 px-3 rounded-xl cursor-pointer active:scale-[0.98] transition-all"
        >
          Override Handoff
        </button>
      ) : (
        !isAssignedToOther && <ChevronRight />
      )}
    </div>
  );
}
