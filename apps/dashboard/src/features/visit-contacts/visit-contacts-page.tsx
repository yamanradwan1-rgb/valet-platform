"use client";

import { useCallback, useState } from "react";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { useSelectedScope } from "../../components/foundation/selected-scope-provider";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { ScopedContextHelp } from "../help/scoped-context-help";
import helpSlot from "../help/help-slot.module.css";
import { VisitContactDetailDrawer } from "./visit-contact-detail-drawer";
import type { VisitContactCorrectionIntent } from "./visit-contact-correction-intent";
import { consumeVisitContactCorrectionRecovery } from "./visit-contact-correction-recovery";
import { visitContactCopy } from "./visit-contact-copy";
import { visitContactErrorMessage } from "./visit-contact-errors";
import { VisitContactResults, type VisitContactSearchItem } from "./visit-contact-results";
import { VisitContactSearch } from "./visit-contact-search";
import {
  visitContactIntentScopeKey,
  visitContactScopeKey,
} from "./visit-contact-scope";
import styles from "./visit-contacts.module.css";
import { useVisitContactSearch } from "./use-visit-contact-search";

export function VisitContactsPage() {
  const dashboard = useProtectedDashboard();
  const { selectionRevision } = useSelectedScope();
  const scopeKey = visitContactScopeKey({ ...dashboard, selectionRevision });
  const intentScopeKey = visitContactIntentScopeKey({
    identityGeneration: dashboard.identityGeneration,
    selectedScope: dashboard.selectedScope,
    selectionRevision,
  });
  return (
    <VisitContactsIntentBoundary
      contentKey={scopeKey}
      intentScopeKey={intentScopeKey}
      key={intentScopeKey}
    />
  );
}

function VisitContactsIntentBoundary({
  contentKey,
  intentScopeKey,
}: {
  readonly contentKey: string;
  readonly intentScopeKey: string;
}) {
  const [pendingCorrection, setPendingCorrection] =
    useState<VisitContactCorrectionIntent | null>(() =>
      consumeVisitContactCorrectionRecovery(intentScopeKey));
  return (
    <VisitContactsContent
      contentKey={contentKey}
      onPendingCorrection={setPendingCorrection}
      pendingCorrection={pendingCorrection}
    />
  );
}

function sameItem(left: VisitContactSearchItem, right: VisitContactSearchItem) {
  return left.kind === right.kind && (
    left.kind === "CUSTOMER"
      ? right.kind === "CUSTOMER" && left.customerId === right.customerId
      : right.kind === "VEHICLE" && left.vehicleId === right.vehicleId
  );
}

function VisitContactsContent({
  contentKey,
  ...props
}: {
  readonly contentKey: string;
  readonly onPendingCorrection: (intent: VisitContactCorrectionIntent | null) => void;
  readonly pendingCorrection: VisitContactCorrectionIntent | null;
}) {
  return <VisitContactsContentInner {...props} key={contentKey} />;
}

function VisitContactsContentInner(props: {
  readonly onPendingCorrection: (intent: VisitContactCorrectionIntent | null) => void;
  readonly pendingCorrection: VisitContactCorrectionIntent | null;
}) {
  const dashboard = useProtectedDashboard();
  const { locale } = useDashboardLocale();
  const t = visitContactCopy(locale);
  const { onPendingCorrection, pendingCorrection } = props;
  const [selected, setSelected] = useState<VisitContactSearchItem | null>(null);
  const clearProtectedSelection = useCallback(() => {
    setSelected(null);
    onPendingCorrection(null);
  }, [onPendingCorrection]);
  const search = useVisitContactSearch(clearProtectedSelection);
  const scopeLabel = search.scope?.role === "LOCATION_MANAGER"
    ? t.authorizedLocations
    : t.allLocations;
  const matchingSelected = selected && search.data
    ? search.data.items.find((item) => sameItem(item, selected)) ?? null
    : null;
  const selectedForDrawer = matchingSelected ?? selected;

  function submit() {
    setSelected(null);
    search.submit();
  }
  function mode(next: Parameters<typeof search.setMode>[0]) {
    setSelected(null);
    search.setMode(next);
  }
  function select(item: VisitContactSearchItem) {
    setSelected(item);
  }
  function updateToken(updatedAt: string) {
    setSelected((current) => current?.kind === "CUSTOMER"
      ? { ...current, customerUpdatedAt: updatedAt }
      : current);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={helpSlot.pageTitleRow}>
            <h1 className={styles.title}>{t.title}</h1>
            <ScopedContextHelp helpKey="contacts.page" />
          </div>
          <p className={styles.subtitle}>{t.subtitle}</p>
        </div>
        <span className={styles.scopeBadge}>{scopeLabel}</span>
      </div>
      <VisitContactSearch
        draft={search.draft}
        loading={search.loading}
        mode={search.mode}
        onDraft={search.setDraft}
        onMode={mode}
        onSubmit={submit}
        t={t}
      />
      {pendingCorrection && selected === null ? (
        <div className={styles.notice} role="status">
          {pendingCorrection.sessionGeneration === dashboard.sessionGeneration
            ? t.resumeCorrection
            : t.authRetry}
        </div>
      ) : null}
      {!search.submitted ? <div className={styles.state}>{t.initial}</div> : null}
      {search.loading ? <div className={styles.state} role="status">{t.searching}</div> : null}
      {search.error ? (
        <div className={styles.error} role="alert">
          <span>
            {search.error instanceof Error && search.error.message === "VISIT_CONTACT_SEARCH_INVALID"
              ? search.mode === "NAME" ? t.invalidName : search.mode === "PHONE" ? t.invalidPhone : t.invalidPlate
              : visitContactErrorMessage(search.error, t)}
          </span>
          {search.submitted ? <button className={styles.secondary} onClick={search.reload} type="button">{t.retry}</button> : null}
        </div>
      ) : null}
      {!search.loading && !search.error && search.data ? (
        <VisitContactResults
          canNext={search.canNext}
          canPrevious={search.canPrevious}
          data={search.data}
          onNext={() => { setSelected(null); search.next(); }}
          onPrevious={() => { setSelected(null); search.previous(); }}
          onSelect={select}
          t={t}
        />
      ) : null}
      {selectedForDrawer && search.scope ? (
        <VisitContactDetailDrawer
          item={selectedForDrawer}
          onAccessLoss={(reason) => {
            search.failCurrent(reason);
          }}
          onClose={() => setSelected(null)}
          onClearPendingCorrection={() => onPendingCorrection(null)}
          onCorrectionIntentChange={onPendingCorrection}
          onNeedsCorrectionSearch={(intent) => {
            onPendingCorrection(intent);
            setSelected(null);
          }}
          onReconcile={search.reload}
          onToken={updateToken}
          organizationId={search.scope.organizationId}
          pendingCorrection={pendingCorrection}
          reconcileEvidence={search.completedRevision}
          reconcileMatched={matchingSelected !== null}
          role={search.scope.role}
        />
      ) : null}
    </div>
  );
}
