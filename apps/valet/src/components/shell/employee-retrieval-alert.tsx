"use client";

import { useEffect, useRef, useState, type JSX } from "react";

import type { UseTaskQueueResult } from "../../features/task-queue/use-task-queue";
import {
  createRetrievalAlertTracker,
  observeRetrievalSnapshot,
} from "../../features/retrieval-alert/retrieval-alert-tracker";
import { attemptRetrievalTaskAlertAudio } from "../../features/retrieval-alert/retrieval-alert-audio";
import { useEmployeeI18n } from "./employee-i18n";

export interface EmployeeRetrievalAlertProps {
  readonly onOpenTaskQueue: () => void;
  readonly taskQueue: UseTaskQueueResult;
}

export interface RetrievalAlertBannersProps {
  readonly body: string;
  readonly dir: "ltr" | "rtl";
  readonly onOpenTask: (taskId: string) => void;
  readonly taskIds: readonly string[];
  readonly title: string;
}

export function RetrievalAlertBanners({
  body,
  dir,
  onOpenTask,
  taskIds,
  title,
}: RetrievalAlertBannersProps): JSX.Element {
  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="absolute inset-x-4 top-20 z-30 space-y-2"
      dir={dir}
      role="status"
    >
      {taskIds.map((taskId) => (
        <button
          className="w-full rounded-2xl border border-vblue/25 bg-white px-4 py-3 text-start shadow-xl"
          key={taskId}
          onClick={() => onOpenTask(taskId)}
          type="button"
        >
          <span className="block font-heading text-sm font-bold text-navy">
            {title}
          </span>
          <span className="mt-0.5 block text-xs text-neutral">{body}</span>
        </button>
      ))}
    </div>
  );
}

export function EmployeeRetrievalAlert({
  onOpenTaskQueue,
  taskQueue,
}: EmployeeRetrievalAlertProps): JSX.Element | null {
  const { dir, t } = useEmployeeI18n();
  const tracker = useRef(createRetrievalAlertTracker());
  const [alertTaskIds, setAlertTaskIds] = useState<readonly string[]>([]);

  useEffect(() => {
    if (taskQueue.isHardStopped) {
      tracker.current = createRetrievalAlertTracker();
      // Queue hard-stop is an external authorization event; clear immediately.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAlertTaskIds([]);
      return;
    }

    const newIds = observeRetrievalSnapshot(
      tracker.current,
      taskQueue.tasks,
      taskQueue.successfulSnapshotCount,
    );
    if (newIds.length === 0) return undefined;

    for (let index = 0; index < newIds.length; index += 1) {
      attemptRetrievalTaskAlertAudio();
    }
    // A successful canonical queue snapshot is the external event source.
    setAlertTaskIds((current) => [...current, ...newIds]);
  }, [
    taskQueue.isHardStopped,
    taskQueue.successfulSnapshotCount,
    taskQueue.tasks,
  ]);

  if (alertTaskIds.length === 0) return null;

  return (
    <RetrievalAlertBanners
      body={t.retrievalAlertBody}
      dir={dir}
      onOpenTask={(taskId) => {
        setAlertTaskIds((current) =>
          current.filter((candidate) => candidate !== taskId),
        );
        onOpenTaskQueue();
      }}
      taskIds={alertTaskIds}
      title={t.retrievalAlertTitle}
    />
  );
}
