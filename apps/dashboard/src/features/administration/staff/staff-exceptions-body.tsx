"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import { administrationScopeKey } from "../administration-scope";
import { styles } from "../administration-ui";
import { useAuthoritativeRead } from "../use-authoritative-read";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import { ShiftPresenceExceptions } from "../settings/shift-presence-exceptions";
import { ShiftPresenceReviewDialog } from "../settings/shift-presence-review-dialog";
import { PresenceReadFeedback } from "../settings/shift-presence-list-ui";
import { PresenceMutationFeedback } from "../settings/shift-presence-feedback";
import { presenceCopy } from "../settings/shift-presence-copy";
import { presenceId } from "../settings/shift-presence-id";
import { usePresenceApi } from "../settings/use-presence-api";
import { usePresenceForeground } from "../settings/use-presence-foreground";
import { useShiftPresenceMutation } from "../settings/use-shift-presence-mutation";

/** Operational exception queue for the exact selected Company/Location scope. */
export function StaffExceptionsBody() {
  const dashboard = useProtectedDashboard();
  const { locale } = useDashboardLocale();
  const selected = dashboard.selectedScope;
  if (
    selected.authority !== "COMPANY_ADMIN" &&
    selected.authority !== "LOCATION_MANAGER"
  ) return null;

  const location = selected.authority === "LOCATION_MANAGER"
    ? selected.location
    : selected.context.scope.kind === "LOCATION" &&
        selected.context.selectedLocation?.locationId === selected.context.scope.locationId
      ? selected.context.selectedLocation
      : null;

  if (!location) {
    return (
      <section className={styles.card} aria-label={presenceCopy(locale)("exceptions")}
        data-testid="staff-presence-select-location">
        <div className={styles.cardPad}>
          <h2 className={styles.sectionTitle}>{presenceCopy(locale)("exceptions")}</h2>
          <p className={styles.muted} role="status">
            {locale === "ar"
              ? "اختر موقعًا محددًا من محدد المواقع لعرض طلبات استثناء الحضور ومراجعتها."
              : "Select an exact Location to view and review presence exception requests."}
          </p>
        </div>
      </section>
    );
  }

  return (
    <ExactLocationExceptions
      key={`${administrationScopeKey(dashboard)}:${location.locationId}`}
      locale={locale}
      locationName={location.name}
    />
  );
}

function ExactLocationExceptions(props: {
  readonly locale: DashboardLocale;
  readonly locationName: string;
}) {
  const dashboard = useProtectedDashboard();
  const scopeKey = administrationScopeKey(dashboard);
  const { api, live } = usePresenceApi(false);
  const load = useCallback((signal: AbortSignal) => api.policy(signal), [api]);
  const policy = useAuthoritativeRead(`${scopeKey}:staff-exceptions:policy`, load);
  const { refresh: refreshPolicy } = policy;
  const [epoch, setEpoch] = useState(0);
  const [selected, setSelected] = useState<{
    readonly id: string;
    readonly generation: string;
  } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const section = useRef<HTMLElement>(null);
  const refresh = useCallback(() => {
    refreshPolicy();
    setEpoch((value) => value + 1);
  }, [refreshPolicy]);
  // Exception canonical receipts are held by the mutation hook; the list is reread.
  const onCanonical = useCallback(() => {}, []);
  const mutation = useShiftPresenceMutation(api, onCanonical, refresh);
  usePresenceForeground(refresh, selected === null && !mutation.mfaOpen);

  useEffect(() => {
    if (!policy.error && !mutation.denied) return;
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed && live.current) setSelected(null);
    });
    return () => { disposed = true; };
  }, [policy.error, mutation.denied, live]);

  const location = policy.data && "overrides" in policy.data ? policy.data : null;
  const ready = Boolean(location && !policy.loading && !policy.error && !mutation.denied);
  const t = presenceCopy(props.locale);
  const close = () => {
    setSelected(null);
    setEpoch((value) => value + 1);
    requestAnimationFrame(() => {
      if (!live.current) return;
      const previous = opener.current;
      (previous?.isConnected && !previous.matches(":disabled")
        ? previous
        : section.current)?.focus();
    });
  };

  return (
    <section ref={section} tabIndex={-1} aria-label={t("exceptions")}
      data-testid="staff-presence-exceptions" dir={props.locale === "ar" ? "rtl" : "ltr"}
      className={styles.card}>
      {ready ? (
        <ShiftPresenceExceptions
          api={api}
          scopeKey={scopeKey}
          epoch={epoch}
          locale={props.locale}
          locationName={props.locationName}
          blocked={mutation.blocked}
          onOpen={(id) => {
            opener.current = document.activeElement instanceof HTMLElement
              ? document.activeElement : null;
            setSelected({ id, generation: presenceId() });
          }}
        />
      ) : !mutation.denied ? (
        <div className={styles.cardPad}>
          <PresenceReadFeedback locale={props.locale} {...policy} onRefresh={refresh} />
        </div>
      ) : null}
      {mutation.message && !selected ? (
        <div className={styles.cardPad}>
          <PresenceMutationFeedback mutation={mutation} locale={props.locale} />
        </div>
      ) : null}
      {ready && selected && location ? (
        <ShiftPresenceReviewDialog
          key={selected.generation}
          {...selected}
          api={api}
          mutation={mutation}
          locale={props.locale}
          locationName={props.locationName}
          disabled={!location.capabilities.canReviewExceptions}
          onClose={close}
        />
      ) : null}
      {ready && mutation.mfaOpen ? (
        <SensitiveMfaDialog
          api={dashboard.api}
          onAssured={mutation.onAssured}
          onClose={mutation.closeMfa}
        />
      ) : null}
    </section>
  );
}
