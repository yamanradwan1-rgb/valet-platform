"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { FocusDialog } from "../../components/presentation/focus-dialog";
import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { useStaffAuth } from "../../lib/auth/staff-auth-context";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import { managementAlertsEnabled } from "./alert-feature-gate";
import { managementAlertsLocation } from "./alert-scope";
import { managementAlertCopy } from "./alert-copy";
import { readAlertSourceDetail, type AlertSourceDetail } from "./alert-source-api";
import {
  clearAlertIntentFromUrl,
  parseAlertSourceIntent,
  type AlertSourceKind,
} from "./alert-source-intent";
import "./management-alerts.css";

type SourceRead = {
  readonly key: string;
  readonly status: "loading" | "ready" | "unavailable" | "denied";
  readonly detail: AlertSourceDetail | null;
};

function SourceDialog({ kind }: { readonly kind: AlertSourceKind }) {
  const routerQuery = useSearchParams();
  const [currentSearch, setCurrentSearch] = useState("");
  useEffect(() => {
    let mounted = true;
    const synchronize = () => queueMicrotask(() => {
      if (mounted) setCurrentSearch(window.location.search);
    });
    // The mounted Studio uses native pushState + popstate for section history.
    // Read the actual URL on mount, even when Next's query snapshot is older.
    synchronize();
    window.addEventListener("popstate", synchronize);
    return () => {
      mounted = false;
      window.removeEventListener("popstate", synchronize);
    };
  }, [routerQuery]);
  const dashboard = useProtectedDashboard();
  const auth = useStaffAuth();
  const { locale } = useDashboardLocale();
  const copy = managementAlertCopy[locale];
  const intent = parseAlertSourceIntent(new URLSearchParams(currentSearch), kind);
  const category = intent?.category ?? null;
  const sourceId = intent?.sourceId ?? null;
  const episodeId = intent?.episodeId ?? null;
  const locationId = managementAlertsLocation(dashboard.selectedScope);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [read, setRead] = useState<SourceRead>({
    key: "none", status: "loading", detail: null,
  });
  const key = [
    dashboard.identityGeneration, dashboard.sessionGeneration,
    dashboard.selectionRevision, locationId ?? "none",
    category ?? "none", sourceId ?? "none", episodeId ?? "none",
  ].join(":");

  useEffect(() => {
    if (
      category === null || sourceId === null || episodeId === null ||
      locationId === null || !managementAlertsEnabled
    ) return;
    let active = true;
    const controller = new AbortController();
    const stillCurrent = () => active &&
      auth.client.getIdentityGeneration() === dashboard.identityGeneration &&
      auth.client.getSessionGeneration() === dashboard.sessionGeneration &&
      auth.client.getStaffAuthSessionId() !== null;
    queueMicrotask(() => {
      if (!stillCurrent()) return;
      setRead({ key, status: "loading", detail: null });
      void readAlertSourceDetail(
        dashboard.api, locationId, { category, sourceId, episodeId },
        controller.signal,
      ).then(
        (detail) => {
          if (!stillCurrent()) return;
          setRead({ key, status: "ready", detail });
        },
        (reason: unknown) => {
          if (!stillCurrent()) return;
          const denied = reason instanceof DashboardApiError &&
            ["auth", "mfa", "entitlement"].includes(reason.kind);
          setRead({
            key, status: denied ? "denied" : "unavailable", detail: null,
          });
        },
      );
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [
    auth.client, category, dashboard.api, dashboard.identityGeneration,
    dashboard.selectionRevision, dashboard.sessionGeneration,
    episodeId, key, locationId, sourceId,
  ]);

  if (
    !managementAlertsEnabled || intent === null || locationId === null ||
    dismissedKey === key || auth.status !== "authenticated"
  ) return null;
  const current = read.key === key
    ? read : { key, status: "loading", detail: null };
  const close = () => {
    setDismissedKey(key);
    clearAlertIntentFromUrl();
  };
  const item = current.status === "ready" ? current.detail?.item : null;

  return (
    <FocusDialog label={copy.exactSource} onClose={close}>
      <div
        className="management-alert-exact-source"
        dir={locale === "ar" ? "rtl" : "ltr"}
      >
        <h2>{copy.exactSource}</h2>
        {current.status === "loading" ? (
          <p role="status" aria-busy="true">{copy.loadingSource}</p>
        ) : item === null || item === undefined ? (
          <p role="status">
            {current.status === "denied" ? copy.denied : copy.source}
          </p>
        ) : (
          <dl className="management-alert-source-facts">
            <dt>{item.severity === "CRITICAL" ? copy.critical : copy.important}</dt>
            <dd><bdi>{item.title}</bdi></dd>
            <dt>{copy.sourceLabel}</dt>
            <dd><bdi dir="ltr">{item.category} / {item.sourceId}</bdi></dd>
            <dt>{copy.episodeLabel}</dt>
            <dd><bdi dir="ltr">{item.episodeId}</bdi></dd>
            <dt>{copy.occurrence}</dt>
            <dd>
              <time dateTime={item.occurredAt}>
                {new Date(item.occurredAt).toLocaleString(locale === "ar" ? "ar" : "en")}
              </time>
            </dd>
          </dl>
        )}
        <button type="button" onClick={close}>{copy.close}</button>
      </div>
    </FocusDialog>
  );
}

/** Only a validated source page mounts this additive detail surface. */
export function AlertExactSourceSurface({
  kind,
}: {
  readonly kind: AlertSourceKind;
}) {
  if (!managementAlertsEnabled) return null;
  return (
    <Suspense fallback={null}>
      <SourceDialog kind={kind} />
    </Suspense>
  );
}
