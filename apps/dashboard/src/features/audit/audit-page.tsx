"use client";

import { useState, useSyncExternalStore } from "react";
import type { ManagementAuditEvent } from "@valet/contracts";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { useSelectedScope } from "../../components/foundation/selected-scope-provider";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { ScopedContextHelp } from "../help/scoped-context-help";
import helpSlot from "../help/help-slot.module.css";
import { AuditDetailDrawer } from "./audit-detail-drawer";
import { auditCopy } from "./audit-copy";
import { auditErrorMessage } from "./audit-errors";
import { AuditFilters } from "./audit-filters";
import { AuditTable } from "./audit-table";
import { auditScope, auditScopeKey } from "./audit-scope";
import styles from "./audit.module.css";
import { useAuditPage } from "./use-audit-page";
import { auditTimeContext } from "./audit-presentation";
import { InvestigationDemo } from "./investigation-demo";
import switchStyles from "./audit-view-switch.module.css";

type AuditView = "events" | "investigation";

function subscribeToQuery(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function readReviewQuery(): boolean | null {
  return new URLSearchParams(window.location.search).get("investigationDemo") === "1";
}

function serverReviewQuery(): boolean | null {
  return null;
}

export function AuditPage() {
  const dashboard = useProtectedDashboard();
  const { selectionRevision } = useSelectedScope();
  const scopeKey = auditScopeKey({ ...dashboard, selectionRevision });
  return <AuditContent key={scopeKey} />;
}

function AuditContent() {
  const dashboard = useProtectedDashboard();
  const { locale } = useDashboardLocale();
  const t = auditCopy(locale);
  const scope = auditScope(dashboard.selectedScope);
  // null on SSR and the first hydration pass. This guarantees that no live
  // Audit hook mounts until the URL's opt-in choice has been resolved.
  const reviewOptIn = useSyncExternalStore(subscribeToQuery, readReviewQuery, serverReviewQuery);
  const queryReady = reviewOptIn !== null;
  const [chosenView, setChosenView] = useState<AuditView | null>(null);
  const view = chosenView ?? (reviewOptIn ? "investigation" : "events");

  const canReview = scope?.kind === "LOCATION" &&
    (scope.role === "COMPANY_ADMIN" || scope.role === "LOCATION_MANAGER");
  // The selected Concept A remains review-only. In local development,
  // authorized admins/managers can discover the tab from the existing Audit
  // sidebar route without manually typing the review query; ordinary Audit
  // Events remains the default. Production still requires explicit opt-in.
  const showSwitch = canReview &&
    (reviewOptIn === true || process.env.NODE_ENV === "development");
  const showInvestigation = showSwitch && view === "investigation";
  const scopeLabel =
    scope?.kind === "ORGANIZATION"
      ? t.organizationScope
      : t.locationScope;
  function changeView(next: AuditView) {
    setChosenView(next);
  }
  return (
    <div className={`${styles.page}${showInvestigation ? ` ${switchStyles.widePage}` : ""}`}>
      <div className={styles.header}>
        <div>
          <div className={helpSlot.pageTitleRow}>
            <h1 className={styles.title}>{t.title}</h1>
            <ScopedContextHelp helpKey="audit.page" />
          </div>
          <p className={styles.subtitle}>{t.subtitle}</p>
        </div>
        <span className={styles.scopeBadge}>{scopeLabel}</span>
      </div>
      {showInvestigation ? (
        <p className={switchStyles.notice} role="note">
          <strong className={switchStyles.noticeTitle}>
            {locale === "ar" ? "بيانات تجريبية · نموذج واجهة" : "DEMO DATA · UX PROTOTYPE"}
          </strong>
          <span>
            {locale === "ar"
              ? "مراجع أحداث خيالية وليست UUID حقيقية؛ لا يسترجع هذا البحث بيانات العملاء أو أدلة فعلية. التوقيت Asia/Amman (UTC+03:00)."
              : "Fictional event references (not database UUIDs). No real customer records or Investigation API queries. Asia/Amman (UTC+03:00)."}
          </span>
        </p>
      ) : null}
      {showSwitch ? (
        <div className={switchStyles.switchArea}>
          <div
            aria-label={locale === "ar" ? "وضع سجل التدقيق" : "Audit Log mode"}
            className={switchStyles.tabs}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next: AuditView = event.key === "Home"
                ? "events"
                : event.key === "End"
                  ? "investigation"
                  : view === "events" ? "investigation" : "events";
              const id = next === "events" ? "audit-events-tab" : "audit-investigation-tab";
              event.currentTarget.querySelector<HTMLButtonElement>(`#${id}`)?.focus();
              changeView(next);
            }}
            role="tablist"
          >
            <button
              aria-controls="audit-events-panel"
              aria-selected={!showInvestigation}
              className={switchStyles.tab}
              id="audit-events-tab"
              onClick={() => changeView("events")}
              role="tab"
              tabIndex={showInvestigation ? -1 : 0}
              type="button"
            >
              {locale === "ar" ? "أحداث التدقيق" : "Audit Events"}
            </button>
            <button
              aria-controls="audit-investigation-panel"
              aria-selected={showInvestigation}
              className={switchStyles.tab}
              id="audit-investigation-tab"
              onClick={() => changeView("investigation")}
              role="tab"
              tabIndex={showInvestigation ? 0 : -1}
              type="button"
            >
              {locale === "ar" ? "بحث التحقيق" : "Investigation Search"}
            </button>
          </div>
          <span className={switchStyles.modeHint}>
            {locale === "ar"
              ? "ابحث عن الأدلة المطابقة وافتح تاريخ الجلسة الكامل"
              : "Search witnesses · open the complete session history"}
          </span>
        </div>
      ) : null}
      {!queryReady ? (
        <div className={styles.state} role="status">{t.loading}</div>
      ) : showInvestigation ? (
        <section aria-labelledby="audit-investigation-tab" id="audit-investigation-panel" role="tabpanel">
          <InvestigationDemo locale={locale} />
        </section>
      ) : showSwitch ? (
        <section aria-labelledby="audit-events-tab" id="audit-events-panel" role="tabpanel">
          <AuditEventsContent />
        </section>
      ) : <AuditEventsContent />}
      {showSwitch && showInvestigation ? (
        <section aria-labelledby="audit-events-tab" hidden id="audit-events-panel" role="tabpanel" />
      ) : null}
      {showSwitch && !showInvestigation ? (
        <section aria-labelledby="audit-investigation-tab" hidden id="audit-investigation-panel" role="tabpanel" />
      ) : null}
    </div>
  );
}

function AuditEventsContent() {
  const dashboard = useProtectedDashboard();
  const context = auditTimeContext(dashboard.selectedScope);
  const { locale } = useDashboardLocale();
  const t = auditCopy(locale);
  const audit = useAuditPage();
  const [selected, setSelected] = useState<ManagementAuditEvent | null>(null);
  const showEventType = audit.scope?.role !== "SUPERVISOR";

  return (
    <>
      <AuditFilters
        eventType={audit.eventType}
        onEventType={(value) => {
          setSelected(null);
          audit.setEventType(value);
        }}
        showEventType={showEventType}
        t={t}
      />
      {audit.loading ? (
        <div className={styles.state} role="status">{t.loading}</div>
      ) : null}
      {audit.error ? (
        <div className={styles.error} role="alert">
          <span>{auditErrorMessage(audit.error, t)}</span>
          <button className={styles.secondary} onClick={audit.retry} type="button">
            {t.retry}
          </button>
        </div>
      ) : null}
      {!audit.loading && !audit.error && audit.data ? (
        <AuditTable
          canNext={audit.canNext}
          context={context}
          canPrevious={audit.canPrevious}
          items={audit.data.items}
          next={() => {
            setSelected(null);
            audit.next();
          }}
          previous={() => {
            setSelected(null);
            audit.previous();
          }}
          select={setSelected}
          t={t}
        />
      ) : null}
      {selected && !audit.loading && !audit.error ? (
        <AuditDetailDrawer
          context={context}
          event={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}
