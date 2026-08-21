"use client";

import { useMemo, type JSX } from "react";
import type { StaffTaskQueueItem } from "@valet/contracts";

import type { Screen } from "../../types/employee-ui";
import { ChevronRight, PlusIcon } from "../icons/employee-icons";
import { Badge, VehicleIdentity } from "../ui/employee-primitives";
import { useTaskQueue } from "../../features/task-queue/use-task-queue";
import {
  toStaffTaskQueueItemViewModel,
  type StaffTaskQueueItemViewModel,
} from "../../features/task-queue/task-queue-view-model";

export interface TaskQueueScreenProps {
  readonly mode?: "live" | "prototype" | undefined;
  readonly nav?: ((s: Screen) => void) | undefined;
  readonly locationId?: string | null | undefined;
  readonly locationName?: string | undefined;
  readonly shiftStartedAt?: string | undefined;
  readonly membershipId?: string | undefined;
  readonly initialTasks?: StaffTaskQueueItem[] | undefined;
  readonly onAuthorizationLoss?: (() => void) | undefined;
}

function formatShiftStartTime(isoString?: string | undefined): string {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

export function TaskQueueScreen({
  mode,
  locationId,
  locationName,
  shiftStartedAt,
  membershipId,
  initialTasks,
  onAuthorizationLoss,
}: TaskQueueScreenProps): JSX.Element {
  const isLiveMode = mode === "live" || Boolean(locationId || initialTasks);
  const { tasks: liveTasks } = useTaskQueue({
    locationId: isLiveMode ? (locationId ?? null) : null,
    onAuthorizationLoss,
  });

  const viewModels = useMemo<StaffTaskQueueItemViewModel[]>(() => {
    if (!isLiveMode) return [];
    const items = initialTasks ?? (locationId ? liveTasks : []);
    return items.map((t) => toStaffTaskQueueItemViewModel(t, membershipId));
  }, [isLiveMode, initialTasks, locationId, liveTasks, membershipId]);

  const priorityTask = viewModels[0] ?? null;
  const queueTasks = viewModels.slice(1);

  const formattedShiftTime = isLiveMode
    ? formatShiftStartTime(shiftStartedAt)
    : "6:00 PM";
  const displayLocation = isLiveMode
    ? (locationName ?? "")
    : (locationName ?? "Four Seasons Amman");

  return (
    <div>
      {/* Shift active status banner */}
      <div className="bg-navy-3 px-5 py-2.5 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-vsuccess animate-pulse" />
        <span className="text-white text-xs font-semibold">Shift active</span>
        <span className="text-muted text-xs">
          · {formattedShiftTime} – now · {displayLocation}
        </span>
      </div>

      <div className="px-5 py-5 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-navy font-bold text-2xl">Tasks</h1>
          <button
            type="button"
            className="bg-vblue text-white text-sm font-bold px-4 h-9 rounded-xl flex items-center gap-1.5 cursor-pointer active:scale-[0.98] transition-all shadow-sm"
          >
            <PlusIcon />
            New Vehicle
          </button>
        </div>

        {/* Priority task card */}
        {!isLiveMode ? (
          // Prototype fallback representation for component baseline tests
          <div className="bg-white rounded-2xl border border-vborder overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-shadow">
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
              <p className="text-neutral text-[13px] mt-1.5">
                Requested 2 min ago
              </p>
              <div className="mt-4 pt-4 border-t border-vborder flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-neutral uppercase tracking-wider">
                    Pickup
                  </p>
                  <p className="text-navy font-semibold text-sm mt-0.5">
                    Main Entrance
                  </p>
                </div>
                <button className="bg-vblue text-white text-sm font-bold px-5 h-10 rounded-xl cursor-pointer active:scale-[0.98] transition-all">
                  Accept Task
                </button>
              </div>
            </div>
          </div>
        ) : priorityTask ? (
          // Live Priority Task Card using approved AGE and STATUS slots with exact base visual classes
          <div className="bg-white rounded-2xl border border-vborder overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-shadow">
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
        ) : null}

        {/* Queue list */}
        <div>
          <p className="text-muted text-[10px] font-bold uppercase tracking-widest mb-3">
            Queue
          </p>
          <div className="space-y-2">
            {!isLiveMode
              ? // Prototype fallback representation for component baseline tests
                [
                  {
                    type: "checkin" as const,
                    model: "Toyota Camry",
                    plate: "87-65432",
                    info: "just now",
                    meta: "Check-in",
                  },
                  {
                    type: "parking" as const,
                    model: "Mercedes E-Class",
                    plate: "45-88231",
                    info: "5 min ago",
                    meta: "Zone A",
                  },
                  {
                    type: "handoff" as const,
                    model: "Audi Q7",
                    plate: "99-12345",
                    info: "waiting",
                    meta: "Main Entrance",
                  },
                ].map((task, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-xl border border-vborder px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={task.type} />
                        <span className="text-muted text-xs">{task.info}</span>
                      </div>
                      <p className="font-heading font-bold text-navy text-[15px] leading-tight">
                        {task.model}
                      </p>
                      <p className="text-neutral text-xs mt-0.5">
                        {task.plate} · {task.meta}
                      </p>
                    </div>
                    <ChevronRight />
                  </div>
                ))
              : queueTasks.length > 0
                ? queueTasks.map((task) => (
                    <div
                      key={task.taskId}
                      className="bg-white rounded-xl border border-vborder px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={task.badgeVariant} />
                          <span className="text-muted text-xs">
                            {task.timeText}
                          </span>
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
                  ))
                : null}
          </div>
        </div>
      </div>
    </div>
  );
}
