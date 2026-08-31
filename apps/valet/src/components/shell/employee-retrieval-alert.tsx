"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { UseTaskQueueResult } from "../../features/task-queue/use-task-queue";
import {
  createRetrievalAlertTracker,
  observeRetrievalIdentity,
  observeRetrievalSnapshot,
} from "../../features/retrieval-alert/retrieval-alert-tracker";
import { subscribeEmployeePushIdentity } from "../../features/employee-web-push/employee-push-identity-bridge";
import { attemptRetrievalTaskAlertAudio } from "../../features/retrieval-alert/retrieval-alert-audio";
import {
  completeAlertSwipe,
  moveAlertSwipe,
  startAlertSwipe,
  type AlertSwipeGesture,
} from "../../features/retrieval-alert/retrieval-alert-gesture";
import { useEmployeeI18n } from "./employee-i18n";

export interface EmployeeRetrievalAlertProps {
  readonly onOpenTaskQueue: () => void;
  readonly taskQueue: UseTaskQueueResult;
}

export interface RetrievalAlertBannersProps {
  readonly body: string;
  readonly dismissLabel: string;
  readonly dir: "ltr" | "rtl";
  readonly onDismiss: (taskId: string) => void;
  readonly onOpenTask: (taskId: string) => void;
  readonly taskIds: readonly string[];
  readonly title: string;
}

export interface RetrievalAlertBannerProps {
  readonly body: string;
  readonly dismissLabel: string;
  readonly onDismiss: (taskId: string) => void;
  readonly onOpenTask: (taskId: string) => void;
  readonly taskId: string;
  readonly title: string;
}

export function RetrievalAlertBanner({
  body,
  dismissLabel,
  onDismiss,
  onOpenTask,
  taskId,
  title,
}: RetrievalAlertBannerProps): JSX.Element {
  const gesture = useRef<AlertSwipeGesture | null>(null);
  const suppressClick = useRef(false);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [dragging, setDragging] = useState(false);

  const suppressGestureClick = (): void => {
    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  };
  const resetGesture = (): void => {
    gesture.current = null;
    setDragging(false);
    setDragOffsetY(0);
  };
  const cancelGesture = (): void => {
    if (gesture.current?.moved) suppressGestureClick();
    resetGesture();
  };
  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>): void => {
    if (
      gesture.current !== null &&
      gesture.current.pointerId !== event.pointerId
    ) {
      cancelGesture();
      return;
    }
    if (!event.isPrimary || event.button !== 0) return;
    gesture.current = startAlertSwipe(
      event.pointerId,
      event.clientX,
      event.clientY,
    );
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>): void => {
    if (gesture.current === null) return;
    const next = moveAlertSwipe(
      gesture.current,
      event.pointerId,
      event.clientX,
      event.clientY,
    );
    gesture.current = next;
    if (next.cancelled) {
      cancelGesture();
      return;
    }
    if (next.offsetY < 0) event.preventDefault();
    setDragOffsetY(next.offsetY);
  };
  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>): void => {
    if (gesture.current === null) return;
    const result = completeAlertSwipe(
      gesture.current,
      event.pointerId,
      event.clientX,
      event.clientY,
    );
    if (result.suppressClick) suppressGestureClick();
    resetGesture();
    if (result.dismiss) onDismiss(taskId);
  };
  const handleOpen = (event: ReactMouseEvent<HTMLButtonElement>): void => {
    if (suppressClick.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressClick.current = false;
      return;
    }
    onOpenTask(taskId);
  };

  return (
    <article
      className={`flex w-full items-center rounded-2xl border border-vblue/25 bg-white shadow-xl ${
        dragging
          ? "transition-none"
          : "transition-[transform,opacity] duration-150"
      } [opacity:var(--retrieval-alert-opacity)] [transform:translate3d(0,var(--retrieval-alert-drag-y),0)] motion-reduce:transform-none motion-reduce:opacity-100 motion-reduce:transition-none`}
      onLostPointerCapture={cancelGesture}
      onPointerCancel={cancelGesture}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={
        {
          "--retrieval-alert-drag-y": `${dragOffsetY}px`,
          "--retrieval-alert-opacity": Math.max(
            0.55,
            1 - Math.abs(dragOffsetY) / 120,
          ),
          touchAction: "pan-x pan-down pinch-zoom",
        } as CSSProperties
      }
    >
      <button
        className="min-w-0 flex-1 px-4 py-3 text-start"
        onClick={handleOpen}
        type="button"
      >
        <span className="block font-heading text-sm font-bold text-navy">
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-neutral">{body}</span>
      </button>
      <button
        aria-label={dismissLabel}
        className="me-2 min-h-11 rounded-xl px-3 text-xs font-semibold text-vblue"
        onClick={(event) => {
          event.stopPropagation();
          onDismiss(taskId);
        }}
        type="button"
      >
        {dismissLabel}
      </button>
    </article>
  );
}

export function RetrievalAlertBanners({
  body,
  dismissLabel,
  dir,
  onDismiss,
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
        <RetrievalAlertBanner
          body={body}
          dismissLabel={dismissLabel}
          key={taskId}
          onDismiss={onDismiss}
          onOpenTask={onOpenTask}
          taskId={taskId}
          title={title}
        />
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

  useEffect(
    () =>
      subscribeEmployeePushIdentity((identity) =>
        observeRetrievalIdentity(tracker.current, identity),
      ),
    [],
  );

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
      dismissLabel={t.dismissAction}
      dir={dir}
      onDismiss={(taskId) => {
        setAlertTaskIds((current) =>
          current.filter((candidate) => candidate !== taskId),
        );
      }}
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
