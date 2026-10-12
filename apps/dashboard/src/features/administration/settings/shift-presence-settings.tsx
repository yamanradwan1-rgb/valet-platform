"use client";
import { presenceId } from "./shift-presence-id";

import { useCallback, useEffect, useRef, useState } from "react";
import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import { administrationScopeKey } from "../administration-scope";
import { styles } from "../administration-ui";
import { useAuthoritativeRead } from "../use-authoritative-read";
import { SensitiveMfaDialog } from "../sensitive-mfa-dialog";
import {
  type PresenceCanonical,
  type PresenceCompany,
  type PresenceLocation,
} from "./shift-presence-api";
import { useShiftPresenceMutation } from "./use-shift-presence-mutation";
import { presenceCopy } from "./shift-presence-copy";
import { ShiftPresencePolicy } from "./shift-presence-policy";
import { ShiftPresenceReadiness } from "./shift-presence-readiness";
import { ShiftPresenceZones } from "./shift-presence-zones";
import { ShiftPresenceExceptions } from "./shift-presence-exceptions";
import {
  ShiftPresenceZoneDialog,
  type ZoneDialogTarget,
} from "./shift-presence-zone-dialog";
import { ShiftPresenceReviewDialog } from "./shift-presence-review-dialog";
import { PresenceMutationFeedback } from "./shift-presence-feedback";
import { PresenceReadFeedback } from "./shift-presence-list-ui";
import feature from "./shift-presence.module.css";
import { usePresenceApi } from "./use-presence-api";
import { isPresenceDenied } from "./shift-presence-errors";
import { usePresenceForeground } from "./use-presence-foreground";
import { ScopedContextHelp } from "../../help/scoped-context-help";

/** Keyed full administration lifetime, identical Location composition for CA and LM. */
export function ShiftPresenceSettings({
  company = false,
}: {
  readonly company?: boolean;
}) {
  const dashboard = useProtectedDashboard();
  return (
    <PresenceScope
      key={`${administrationScopeKey(dashboard)}:${company ? "company" : "location"}`}
      company={company}
    />
  );
}

function PresenceScope({ company }: { readonly company: boolean }) {
  const dashboard = useProtectedDashboard();
  const scopeKey = `${administrationScopeKey(dashboard)}:${company ? "company" : "location"}`;
  const { locale } = useDashboardLocale();
  const t = presenceCopy(locale);
  const { api, live } = usePresenceApi(company);
  const load = useCallback((signal: AbortSignal) => api.policy(signal), [api]);
  const read = useAuthoritativeRead(`${scopeKey}:presence-policy`, load);
  const { replace, refresh: refreshPolicy } = read;
  const [snapshot, setSnapshot] = useState<
    PresenceCompany | PresenceLocation | null
  >(null);
  const [readDenied, setReadDenied] = useState(false);
  useEffect(() => {
    const data = read.data;
    if (data)
      queueMicrotask(() => {
        if (live.current) setSnapshot(data);
      });
  }, [read.data, live]);
  const [epoch, setEpoch] = useState(0);
  const [zone, setZone] = useState<ZoneDialogTarget | null>(null);
  const [exception, setException] = useState<{
    id: string;
    generation: string;
  } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (isPresenceDenied(read.error))
      queueMicrotask(() => {
        if (!live.current) return;
        setReadDenied(true);
        setSnapshot(null);
        setZone(null);
        setException(null);
      });
    else if (read.data && !read.loading)
      queueMicrotask(() => {
        if (live.current) setReadDenied(false);
      });
  }, [read.error, read.data, read.loading, live]);
  const canonical = useCallback(
    (value: PresenceCanonical) => {
      if (value.kind === "POLICY") replace(value.value);
    },
    [replace],
  );
  const refresh = useCallback(() => {
    refreshPolicy();
    setEpoch((value) => value + 1);
  }, [refreshPolicy]);
  const mutation = useShiftPresenceMutation(api, canonical, refresh);
  usePresenceForeground(refresh);
  function closeDialog() {
    setZone(null);
    setException(null);
    requestAnimationFrame(() => {
      if (!live.current) return;
      const target = opener.current;
      (target?.isConnected && !target.matches(":disabled")
        ? target
        : heading.current
      )?.focus();
    });
  }
  const selected = dashboard.selectedScope;
  const locationName =
    selected.authority === "COMPANY_ADMIN"
      ? (selected.context.selectedLocation?.name ?? "")
      : selected.authority === "LOCATION_MANAGER"
        ? selected.location.name
        : "";
  const denied = mutation.denied || readDenied || isPresenceDenied(read.error);
  const data = denied ? null : (read.data ?? snapshot);
  const location = data && "overrides" in data ? data : null;
  return (
    <section
      className={feature.section}
      aria-labelledby="shift-presence-heading"
      data-testid="shift-presence"
    >
      <div className={styles.cardPad}>
        <div className={styles.actions}>
          <h2
            className={styles.sectionTitle}
            id="shift-presence-heading"
            tabIndex={-1}
            ref={heading}
          >
            {t("title")}
          </h2>
          <ScopedContextHelp helpKey="policies.presence" />
        </div>
        {company ? <p className={styles.sectionText}>{t("defaults")}</p> : null}
        <PresenceReadFeedback locale={locale} {...read} onRefresh={refresh} />
        <PresenceMutationFeedback mutation={mutation} locale={locale} />
      </div>
      {data ? (
        <>
          {location ? (
            <ShiftPresenceReadiness
              data={location}
              help={<ScopedContextHelp helpKey="presence.readiness" />}
              locale={locale}
            />
          ) : null}
          <ShiftPresencePolicy
            api={api}
            data={data}
            locale={locale}
            mutation={mutation}
            loading={read.loading || read.error !== null}
          />
          {location ? (
            <>
              <ShiftPresenceZones
                api={api}
                scopeKey={scopeKey}
                epoch={epoch}
                locale={locale}
                disabled={
                  mutation.blocked ||
                  !location.capabilities.canEdit ||
                  read.loading ||
                  read.error !== null
                }
                onOpen={(target) => {
                  opener.current =
                    document.activeElement instanceof HTMLElement
                      ? document.activeElement
                      : null;
                  setZone(target);
                }}
              />
              <ShiftPresenceExceptions
                api={api}
                blocked={mutation.blocked}
                scopeKey={scopeKey}
                epoch={epoch}
                locale={locale}
                locationName={locationName}
                onOpen={(id) => {
                  opener.current =
                    document.activeElement instanceof HTMLElement
                      ? document.activeElement
                      : null;
                  setException({ id, generation: presenceId() });
                }}
              />
            </>
          ) : null}
        </>
      ) : null}
      {!denied && zone && location ? (
        <ShiftPresenceZoneDialog
          key={zone.generation}
          target={zone}
          api={api}
          mutation={mutation}
          locale={locale}
          canEdit={
            location.capabilities.canEdit &&
            !read.loading &&
            read.error === null
          }
          onClose={closeDialog}
        />
      ) : null}
      {!denied && exception && location ? (
        <ShiftPresenceReviewDialog
          key={exception.generation}
          {...exception}
          api={api}
          mutation={mutation}
          locale={locale}
          locationName={locationName}
          onClose={closeDialog}
          disabled={
            read.loading ||
            read.error !== null ||
            !location.capabilities.canReviewExceptions
          }
        />
      ) : null}
      {mutation.mfaOpen ? (
        <SensitiveMfaDialog
          api={dashboard.api}
          onAssured={mutation.onAssured}
          onClose={mutation.closeMfa}
        />
      ) : null}
    </section>
  );
}
