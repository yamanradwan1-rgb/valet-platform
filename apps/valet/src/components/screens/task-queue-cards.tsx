import type { JSX } from "react";
import type { Screen } from "../../types/employee-ui";
import type { StaffTaskQueueItemViewModel } from "../../features/task-queue/task-queue-view-model";
import { ChevronRight } from "../icons/employee-icons";
import { Badge, VehicleIdentity } from "../ui/employee-primitives";

export function LivePriorityTaskCard({
  priorityTask,
  membershipId,
  isActionInFlight = false,
  onAction,
}: {
  readonly isActionInFlight?: boolean | undefined;
  readonly membershipId?: string | undefined;
  readonly onAction: () => void;
  readonly priorityTask: StaffTaskQueueItemViewModel;
}): JSX.Element {
  const isAssignedToOther =
    priorityTask.currentAssigneeMembershipId !== null &&
    membershipId !== undefined &&
    priorityTask.currentAssigneeMembershipId !== membershipId;

  const isDisabled = isAssignedToOther || isActionInFlight;

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
      onClick={!isDisabled ? onAction : undefined}
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
}: {
  readonly isActionInFlight?: boolean | undefined;
  readonly membershipId?: string | undefined;
  readonly onClick?: () => void;
  readonly task: StaffTaskQueueItemViewModel;
}): JSX.Element {
  const isAssignedToOther =
    task.currentAssigneeMembershipId !== null &&
    membershipId !== undefined &&
    task.currentAssigneeMembershipId !== membershipId;

  const isDisabled = isAssignedToOther || isActionInFlight;

  return (
    <div
      onClick={!isDisabled ? onClick : undefined}
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
      {!isAssignedToOther && <ChevronRight />}
    </div>
  );
}

export function PrototypePriorityTaskCard({
  nav,
}: {
  readonly nav?: ((s: Screen) => void) | undefined;
}): JSX.Element {
  return (
    <div
      onClick={() => nav?.("retrieval")}
      className="bg-white rounded-2xl border border-vborder overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="h-1 bg-vblue" />
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <Badge variant="retrieval" />
          <div className="text-right">
            <p className="text-[10px] text-neutral font-semibold uppercase tracking-wider">
              SLA
            </p>
            <span className="font-heading tabular-nums text-xl font-bold text-vdanger">
              02:14
            </span>
          </div>
        </div>
        <VehicleIdentity model="BMW X5" plate="12-34567" color="Black" />
        <p className="text-neutral text-[13px] mt-1.5">Requested 2 min ago</p>
        <div className="mt-4 pt-4 border-t border-vborder flex items-center justify-between">
          <div>
            <p className="text-[10px] text-neutral uppercase tracking-wider">
              Pickup
            </p>
            <p className="text-navy font-semibold text-sm mt-0.5">
              Main Entrance
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              nav?.("retrieval");
            }}
            className="bg-vblue text-white text-sm font-bold px-5 h-10 rounded-xl cursor-pointer active:scale-[0.98] transition-all"
          >
            Accept Task
          </button>
        </div>
      </div>
    </div>
  );
}

export const PROTOTYPE_QUEUE_ITEMS: {
  readonly info: string;
  readonly meta: string;
  readonly model: string;
  readonly plate: string;
  readonly screen: Screen;
  readonly type: "checkin" | "parking" | "handoff";
}[] = [
  {
    type: "checkin",
    model: "Toyota Camry",
    plate: "87-65432",
    info: "just now",
    meta: "Check-in",
    screen: "check-in",
  },
  {
    type: "parking",
    model: "Mercedes E-Class",
    plate: "45-88231",
    info: "5 min ago",
    meta: "Zone A",
    screen: "parking",
  },
  {
    type: "handoff",
    model: "Audi Q7",
    plate: "99-12345",
    info: "waiting",
    meta: "Main Entrance",
    screen: "retrieval",
  },
];
