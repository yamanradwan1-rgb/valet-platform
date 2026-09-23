"use client";

import type { ExportFormat, ReportKind } from "@valet/contracts";
import { BarChart3 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { useSelectedScope } from "../../components/foundation/selected-scope-provider";
import { readCompanySubscription, readLocationSubscription } from "../administration/commercial/commercial-api";
import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { intelligenceScope } from "./intelligence-scope";
import {
  reportExportBaseKey,
  reportExportIntentIsCurrent,
  reportExportSelectionKey,
  type ReportExportIntent,
} from "./report-export-intent";
import {
  rememberReportExportAuthRecovery,
  takeReportExportAuthRecovery,
} from "./report-export-recovery";
import { ReportPreviewDialog } from "./report-preview-dialog";
import { exportReportArtifact, reportExportRequest } from "./reports-export-api";
import type { ReportExportStatus } from "./reports-export-controls";
import { reportsCopy } from "./reports-copy";
import {
  ReportsFileSpreadsheetIcon,
  ReportsFileTextIcon,
} from "./reports-reference-icons";
import {
  downloadArtifact,
  finalExportFailure,
  intelligenceScopeKey,
  previewMessage,
  readReport,
  reportDescriptor,
} from "./reports-page-helpers";
import {
  selectorValue,
  validateReportSelector,
  type ReportResponse,
  type ReportSelector,
  type ReportSelectorValidation,
} from "./reports-presentation";
import styles from "./reports.module.css";
import { useIntelligenceRead } from "./use-intelligence-read";

export function ReportsPage() {
  const dashboard = useProtectedDashboard();
  const { selectionRevision } = useSelectedScope();
  const { locale } = useDashboardLocale();
  const t = reportsCopy(locale);
  const scope = useMemo(
    () => intelligenceScope(dashboard.selectedScope),
    [dashboard.selectedScope],
  );
  const scopeIdentity = intelligenceScopeKey(scope);
  const subscriptionKey = `${dashboard.identityGeneration}:${dashboard.sessionGeneration}:${selectionRevision}:${scopeIdentity}`;
  const [recovery] = useState(() =>
    takeReportExportAuthRecovery(
      dashboard.identityGeneration,
      intelligenceScopeKey(scope),
      selectionRevision,
    ));
  const [dialogKind, setDialogKind] = useState<ReportKind | null>(recovery?.reportKind ?? null);
  const [draftValue, setDraftValue] = useState(recovery ? selectorValue(recovery.selector) : "");
  const [validation, setValidation] = useState<ReportSelectorValidation["kind"] | null>(
    recovery ? "valid" : null,
  );
  const [selector, setSelector] = useState<ReportSelector | null>(recovery?.selector ?? null);
  const [subscriptionState, setSubscriptionState] = useState<{
    readonly allowed: boolean;
    readonly requestKey: string | null;
  }>({ allowed: false, requestKey: null });
  const [exportStatus, setExportStatus] = useState<ReportExportStatus>(
    recovery ? "auth-retry" : "idle",
  );
  const exportRevision = useRef(0);
  const currentExportBase = useRef("");
  const currentExportSelection = useRef("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      currentExportBase.current = "";
      currentExportSelection.current = "";
    };
  }, []);

  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    if (scope === null) return () => controller.abort();
    const read = scope.kind === "COMPANY"
      ? readCompanySubscription(dashboard.api, scope.organizationId, controller.signal)
      : readLocationSubscription(dashboard.api, scope.locationId, controller.signal);
    void read.then((response) => {
      if (!current) return;
      setSubscriptionState({
        allowed: response.subscription?.entitlements.reportExports === true,
        requestKey: subscriptionKey,
      });
    }).catch(() => {
      if (current) setSubscriptionState({ allowed: false, requestKey: subscriptionKey });
    });
    return () => {
      current = false;
      controller.abort();
    };
  }, [dashboard.api, scope, subscriptionKey]);

  const subscriptionLoading = scope !== null && subscriptionState.requestKey !== subscriptionKey;
  const exportAvailable = !subscriptionLoading && subscriptionState.allowed;

  const descriptor = scope && selector ? reportDescriptor(scope, selector) : null;
  const preview = useIntelligenceRead<ReportResponse>({
    descriptor,
    enabled: descriptor !== null,
    load: ({ api, scope: readScope, signal }) => readReport(api, readScope, selector, signal),
  });

  const exportBase = scope && selector && preview.data ? reportExportBaseKey({
    identityGeneration: dashboard.identityGeneration,
    reportKind: selector.kind,
    scope,
    selectionRevision,
    selector,
    sessionGeneration: dashboard.sessionGeneration,
  }) : "";
  const exportSelection = scope && selector && preview.data
    ? reportExportSelectionKey({ reportKind: selector.kind, scope, selectionRevision, selector })
    : "";
  useEffect(() => {
    currentExportBase.current = exportBase;
    currentExportSelection.current = exportSelection;
  }, [exportBase, exportSelection]);

  function openReport(kind: ReportKind) {
    currentExportBase.current = "";
    currentExportSelection.current = "";
    setDialogKind(kind);
    setDraftValue("");
    setValidation(null);
    setSelector(null);
    setExportStatus("idle");
  }

  const closeDialog = useCallback(() => {
    currentExportBase.current = "";
    currentExportSelection.current = "";
    setDialogKind(null);
    setSelector(null);
    setExportStatus("idle");
  }, []);

  function changeDraft(value: string) {
    currentExportBase.current = "";
    currentExportSelection.current = "";
    setDraftValue(value);
    setValidation(null);
    setSelector(null);
    setExportStatus("idle");
  }

  function submitSelector(event: FormEvent) {
    event.preventDefault();
    if (!dialogKind) return;
    const next = validateReportSelector(dialogKind, draftValue);
    setValidation(next.kind);
    setExportStatus("idle");
    setSelector(next.kind === "valid" ? next.selector : null);
  }

  const runExport = useCallback(async (format: ExportFormat) => {
    if (!scope || !selector || !preview.data || !exportAvailable) return;
    const revision = exportRevision.current + 1;
    exportRevision.current = revision;
    const intent: ReportExportIntent = {
      exportIntentRevision: revision,
      format,
      identityGeneration: dashboard.identityGeneration,
      reportKind: selector.kind,
      scope,
      selectionRevision,
      selector,
      sessionGeneration: dashboard.sessionGeneration,
    };
    setExportStatus("exporting");
    try {
      const artifact = await exportReportArtifact(
        dashboard.api,
        scope,
        reportExportRequest(selector, format),
      );
      if (!reportExportIntentIsCurrent(intent, currentExportBase.current, exportRevision.current)) {
        setExportStatus("stale");
        return;
      }
      downloadArtifact(artifact.bytes, artifact.contentType, artifact.filename);
      setExportStatus("idle");
    } catch (error: unknown) {
      const sameSelection = reportExportSelectionKey(intent) === currentExportSelection.current &&
        intent.exportIntentRevision === exportRevision.current;
      if (error instanceof DashboardApiError && error.code === "AUTH_RECONCILED_RETRY_REQUIRED") {
        const recoverable = sameSelection ||
          (!mounted.current && window.location.pathname === "/reports");
        if (recoverable) {
          rememberReportExportAuthRecovery({
            identityGeneration: intent.identityGeneration,
            reportKind: intent.reportKind,
            scopeKey: intelligenceScopeKey(intent.scope),
            selectionRevision: intent.selectionRevision,
            selector: intent.selector,
          });
          if (mounted.current) setExportStatus("auth-retry");
        }
        return;
      }
      if (!reportExportIntentIsCurrent(intent, currentExportBase.current, exportRevision.current)) return;
      if (error instanceof DashboardApiError && error.code === "BINARY_POST_OUTCOME_UNKNOWN") {
        setExportStatus("unknown");
        return;
      }
      const failure = await finalExportFailure(error, dashboard.api, scope);
      if (!reportExportIntentIsCurrent(intent, currentExportBase.current, exportRevision.current)) return;
      setExportStatus(failure);
    }
  }, [dashboard.api, dashboard.identityGeneration, dashboard.sessionGeneration, exportAvailable, preview.data, scope, selectionRevision, selector]);

  if (scope === null) return null;

  return (
    <div className={styles.page} data-testid="md05-reports-page">
      <header className={styles.header}>
        <div><h1>{t.title}</h1><p>{t.subtitle}</p></div>
      </header>
      <div className={styles.mainContainer}>
        <div className={styles.tabs}><span>{t.standardReports}</span></div>
        <div className={styles.tableScroll}>
          <table className={styles.reportTable}>
            <thead><tr><th>{t.reportName}</th><th>{t.category}</th><th>{t.description}</th><th>{t.actions}</th></tr></thead>
            <tbody>{subscriptionLoading ? <ReportSkeleton /> : reportRows(t).map((row) => (
              <tr key={row.kind}>
                <td><div className={styles.reportName}><span className={`${styles.reportIcon} ${row.iconClass}`}>{row.icon}</span><strong>{row.name}</strong></div></td>
                <td className={styles.categoryCell}>{row.category}</td>
                <td className={styles.descriptionCell}>{row.description}</td>
                <td className={styles.actionCell}><button aria-label={row.accessibleName} className={styles.rowAction} onClick={() => openReport(row.kind)} type="button">{t.preview}</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      {dialogKind ? (
        <ReportPreviewDialog
          data={selector ? preview.data : null}
          draftValue={draftValue}
          exportAvailable={exportAvailable}
          exportStatus={exportStatus}
          kind={dialogKind}
          loading={selector ? preview.loading : false}
          locale={locale}
          message={selector && preview.error ? previewMessage(preview.error, t) : null}
          onClose={closeDialog}
          onDraftChange={changeDraft}
          onExport={runExport}
          onRetry={preview.retry}
          onSubmit={submitSelector}
          selectorValidation={validation}
          t={t}
        />
      ) : null}
    </div>
  );
}

function ReportSkeleton() {
  return <>{Array.from({ length: 8 }).map((_, index) => <tr className={styles.skeletonRow} key={index}><td colSpan={4}><div /></td></tr>)}</>;
}

function reportRows(t: ReturnType<typeof reportsCopy>) {
  return [
    { kind: "DAILY" as const, name: t.daily, category: t.dailyCategory, description: t.dailyDescription, accessibleName: t.previewDaily, icon: <ReportsFileTextIcon size={16} />, iconClass: styles.iconBlue },
    { kind: "WEEKLY" as const, name: t.weekly, category: t.weeklyCategory, description: t.weeklyDescription, accessibleName: t.previewWeekly, icon: <BarChart3 size={16} />, iconClass: styles.iconEmerald },
    { kind: "MONTHLY" as const, name: t.monthly, category: t.monthlyCategory, description: t.monthlyDescription, accessibleName: t.previewMonthly, icon: <ReportsFileSpreadsheetIcon size={16} />, iconClass: styles.iconSlate },
  ];
}
