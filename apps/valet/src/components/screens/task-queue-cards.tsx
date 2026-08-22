import type { JSX } from "react";
import type { StaffTaskQueueItemViewModel } from "../../features/task-queue/task-queue-view-model";
import { ChevronRight } from "../icons/employee-icons";
import { Badge, VehicleIdentity } from "../ui/employee-primitives";

export function LivePriorityTaskCard({
  priorityTask,
  onAction,
}: {
  readonly onAction: () => void;
  readonly priorityTask: StaffTaskQueueItemViewModel;
}): JSX.Element {
  return (
    <div
      onClick={onAction}
      className="bg-white rounded-2xl border border-vborder overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-shadow"
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
            onClick={(e) => {
              e.stopPropagation();
              onAction();
            }}
            className={`${
              priorityTask.status === "ACCEPTED" ||
              priorityTask.status === "IN_PROGRESS"
                ? "bg-vsuccess px-4"
                : "bg-vblue px-5"
            } text-white text-sm font-bold h-10 rounded-xl cursor-pointer active:scale-[0.98] transition-all`}
          >
            {priorityTask.status === "ACCEPTED" ||
            priorityTask.status === "IN_PROGRESS"
              ? priorityTask.taskType === "RETRIEVAL"
                ? "Start Retrieval"
                : "Start Parking"
              : "Accept Task"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function LiveQueueItem({
  task,
  onClick,
}: {
  readonly onClick?: () => void;
  readonly task: StaffTaskQueueItemViewModel;
}): JSX.Element {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-vborder px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant={task.badgeVariant} />
          <span className="text-muted text-xs">{task.timeText}</span>
        </div>
        <p className="font-heading font-bold text-navy text-[15px] leading-tight">
          {task.vehicleHeading}
        </p>
        <p className="text-neutral text-xs mt-0.5">
          {task.vehicleIdentifier} · {task.metaText}
        </p>
      </div>
      <ChevronRight />
    </div>
  );
}
