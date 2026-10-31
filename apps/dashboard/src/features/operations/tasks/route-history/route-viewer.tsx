"use client";

import { useCallback, useEffect } from "react";
import { Route, X } from "lucide-react";
import type { ManagementLocation, TaskOverviewEntry } from "@valet/contracts";
import type { DashboardApiClient } from "../../../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../../../lib/api/dashboard-api-error";
import { useDashboardLocale } from "../../../../lib/i18n/locale-provider";
import { FocusDialog } from "../../../../components/presentation/focus-dialog";
import { StatusBadge, styles } from "../../operations-ui";
import {
  operationsTaskTypeLabel,
  operationsTaskStatusLabel,
} from "../../operations-presentation";
import { useCursorPage } from "../../use-cursor-page";
import { useOperationsRead } from "../../use-operations-read";
import { readTaskRecordings } from "./route-history-api";
import { routeCopy } from "./route-copy";
import { RouteStatePanel } from "./route-state";
import { RecordingPage } from "./recording-page";
import s from "./route-history.module.css";

export default function RouteViewer(props: {
  readonly api: DashboardApiClient;
  readonly item: TaskOverviewEntry;
  readonly location: ManagementLocation;
  readonly scopeKey: string;
  readonly onClose: () => void;
}) {
  const { locale } = useDashboardLocale();
  const t = routeCopy(locale);
  const page = useCursorPage();
  const load = useCallback(
    (signal: AbortSignal) =>
      readTaskRecordings(props.api, props.item.taskId, page.cursor, signal),
    [props.api, props.item.taskId, page.cursor],
  );
  const read = useOperationsRead(
    `${props.scopeKey}:${props.item.taskId}:${page.cursor}`,
    load,
  );
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);
  const errorState =
    read.error instanceof DashboardApiError &&
    ["auth", "authorization"].includes(read.error.kind)
      ? "denied"
      : "failed";
  return (
    <div className={s.viewerScope} data-testid="task-route-viewer">
      <FocusDialog label={t.viewer} onClose={props.onClose}>
        <header className={s.viewerHeader}>
          <div className={s.viewerHeading}>
            <span className={s.viewerIcon}>
              <Route size={20} aria-hidden="true" />
            </span>
            <div>
              <h2>{t.viewer}</h2>
              <p>{t.notLive}</p>
            </div>
          </div>
          <button
            type="button"
            className={`${styles.quiet} ${s.close}`}
            onClick={props.onClose}
            aria-label={t.close}
          >
            <X size={19} />
          </button>
        </header>
        <div className={s.context}>
          <strong>
            {operationsTaskTypeLabel(props.item.taskType, locale)}
          </strong>
          <StatusBadge tone="good">
            {operationsTaskStatusLabel(props.item.status, locale)}
          </StatusBadge>
          <span>{props.location.name}</span>
          <span className={s.readOnly}>{t.readOnly}</span>
        </div>
        <div className={s.viewerBody}>
          {read.loading ? (
            <RouteStatePanel state="loading" />
          ) : read.error ? (
            <RouteStatePanel state={errorState} onRetry={read.refresh} />
          ) : !read.data?.recordings.length ? (
            <RouteStatePanel state="unavailable" />
          ) : (
            <RecordingPage
              key={`${page.cursor}:${read.data.recordings[0]!.trackingSessionId}`}
              api={props.api}
              recordings={read.data.recordings}
              scopeKey={props.scopeKey}
              timezone={props.location.timezone}
            />
          )}
        </div>
        <footer className={s.viewerFooter}>
          <p>{t.straight}</p>
          {page.canPrevious || read.data?.nextCursor ? (
            <div className={s.inline}>
              <button
                className={styles.secondary}
                disabled={read.loading || !page.canPrevious}
                onClick={page.previous}
                type="button"
              >
                {t.previousRecordings}
              </button>
              <button
                className={styles.secondary}
                disabled={read.loading || !read.data?.nextCursor}
                onClick={() => page.next(read.data!.nextCursor!)}
                type="button"
              >
                {t.nextRecordings}
              </button>
            </div>
          ) : null}
        </footer>
      </FocusDialog>
    </div>
  );
}
