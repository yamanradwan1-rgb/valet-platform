"use client";

import { useMemo, useRef, useState, type JSX } from "react";
import type { StaffTaskQueueItem } from "@valet/contracts";

import type { Screen } from "../../types/employee-ui";
import { ChevronRight, PlusIcon } from "../icons/employee-icons";
import { Badge } from "../ui/employee-primitives";
import { useTaskQueue } from "../../features/task-queue/use-task-queue";
import {
  toStaffTaskQueueItemViewModel,
  type StaffTaskQueueItemViewModel,
} from "../../features/task-queue/task-queue-view-model";
import { executeParkingTaskAction } from "../../features/parking/parking-task-runner";
import { executeRetrievalTaskAction } from "../../features/retrieval/retrieval-task-runner";
import type { StartParkingPayload } from "../../features/check-in/check-in-types";
import {
  LivePriorityTaskCard,
  LiveQueueItem,
  PROTOTYPE_QUEUE_ITEMS,
  PrototypePriorityTaskCard,
} from "./task-queue-cards";

export interface TaskQueueScreenProps {
  readonly initialTasks?: StaffTaskQueueItem[] | undefined;
  readonly locationId?: string | null | undefined;
  readonly locationName?: string | undefined;
  readonly membershipId?: string | undefined;
  readonly mode?: "live" | "prototype" | undefined;
  readonly nav?: ((s: Screen) => void) | undefined;
  readonly onAuthorizationLoss?: (() => void) | undefined;
  readonly onSelectParkingTask?:
    | ((task: {
        sessionId: string;
        taskId: string;
        taskVersion: number;
      }) => void)
    | undefined;
  readonly onSelectRetrievalTask?:
    | ((task: {
        sessionId: string;
        taskId: string;
        taskStatus: "ACCEPTED" | "IN_PROGRESS";
        taskVersion: number;
      }) => void)
    | undefined;
  readonly onStartParkingSuccess?:
    | ((payload: StartParkingPayload) => void)
    | undefined;
  readonly shiftStartedAt?: string | undefined;
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
  nav,
  locationId,
  locationName,
  shiftStartedAt,
  membershipId,
  initialTasks,
  onAuthorizationLoss,
  onSelectParkingTask,
  onSelectRetrievalTask,
  onStartParkingSuccess,
}: TaskQueueScreenProps): JSX.Element {
  const isLiveMode = mode === "live" || Boolean(locationId || initialTasks);
  const { tasks: liveTasks, client: taskQueueClient } = useTaskQueue({
    locationId: isLiveMode ? (locationId ?? null) : null,
    onAuthorizationLoss,
  });

  const [actionError, setActionError] = useState<string | null>(null);
  const [inFlightTaskId, setInFlightTaskId] = useState<string | null>(null);
  const actionInFlightRef = useRef<boolean>(false);

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

  const handleTaskAction = async (task: StaffTaskQueueItemViewModel) => {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setInFlightTaskId(task.taskId);
    setActionError(null);
    try {
      if (task.taskType === "PARKING") {
        const result = await executeParkingTaskAction(
          taskQueueClient,
          {
            currentAssigneeMembershipId: task.currentAssigneeMembershipId,
            sessionId: task.sessionId,
            status: task.status,
            taskId: task.taskId,
            version: task.version,
          },
          membershipId,
        );

        if (result.kind === "START_PARKING_SUCCESS") {
          onStartParkingSuccess?.(result.payload);
          nav?.("parking");
        } else if (result.kind === "NAVIGATE_IN_PROGRESS") {
          onSelectParkingTask?.({
            sessionId: result.sessionId,
            taskId: result.taskId,
            taskVersion: result.version,
          });
          nav?.("parking");
        } else if (result.kind === "DENIED") {
          setActionError("This task is assigned to another valet employee.");
        }
      } else if (task.taskType === "RETRIEVAL") {
        const result = await executeRetrievalTaskAction(
          taskQueueClient,
          {
            currentAssigneeMembershipId: task.currentAssigneeMembershipId,
            sessionId: task.sessionId,
            status: task.status,
            taskId: task.taskId,
            version: task.version,
          },
          membershipId,
        );

        if (result.kind === "NAVIGATE_ACCEPTED") {
          onSelectRetrievalTask?.({
            sessionId: result.sessionId,
            taskId: result.taskId,
            taskStatus: "ACCEPTED",
            taskVersion: result.taskVersion,
          });
          nav?.("retrieval");
        } else if (result.kind === "NAVIGATE_IN_PROGRESS") {
          onSelectRetrievalTask?.({
            sessionId: result.sessionId,
            taskId: result.taskId,
            taskStatus: "IN_PROGRESS",
            taskVersion: result.taskVersion,
          });
          nav?.("retrieval");
        } else if (result.kind === "DENIED") {
          setActionError("This task is assigned to another valet employee.");
        }
      } else {
        nav?.("retrieval");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to operate task.";
      setActionError(msg);
    } finally {
      actionInFlightRef.current = false;
      setInFlightTaskId(null);
    }
  };

  return (
    <div>
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
            onClick={() => nav?.("check-in")}
            className="bg-vblue text-white text-sm font-bold px-4 h-9 rounded-xl flex items-center gap-1.5 cursor-pointer active:scale-[0.98] transition-all shadow-sm"
          >
            <PlusIcon />
            New Vehicle
          </button>
        </div>

        {actionError && (
          <div className="p-3 bg-red-50 border border-vdanger/20 rounded-xl text-vdanger text-xs">
            {actionError}
          </div>
        )}

        {!isLiveMode ? (
          <PrototypePriorityTaskCard nav={nav} />
        ) : priorityTask ? (
          <LivePriorityTaskCard
            priorityTask={priorityTask}
            membershipId={membershipId}
            isActionInFlight={inFlightTaskId === priorityTask.taskId}
            onAction={() => void handleTaskAction(priorityTask)}
          />
        ) : null}

        <div>
          <p className="text-muted text-[10px] font-bold uppercase tracking-widest mb-3">
            Queue
          </p>
          <div className="space-y-2">
            {!isLiveMode
              ? PROTOTYPE_QUEUE_ITEMS.map((task, i) => (
                  <div
                    key={i}
                    onClick={() => nav?.(task.screen)}
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
                    <LiveQueueItem
                      key={task.taskId}
                      task={task}
                      membershipId={membershipId}
                      isActionInFlight={inFlightTaskId === task.taskId}
                      onClick={() => void handleTaskAction(task)}
                    />
                  ))
                : null}
          </div>
        </div>
      </div>
    </div>
  );
}
