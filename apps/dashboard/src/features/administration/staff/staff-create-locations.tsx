"use client";

import { useCallback, useState } from "react";
import { useProtectedDashboard } from "../../../components/foundation/protected-dashboard-context";
import { useDashboardLocale } from "../../../lib/i18n/locale-provider";
import {
  listCompanyAdminLocations,
  listLocationManagerLocations,
} from "../../../lib/scope/dashboard-scope";
import {
  administrationScope,
  administrationScopeKey,
} from "../administration-scope";
import { administrationCopy } from "../administration-copy";
import { styles, ReadState } from "../administration-ui";
import { useAuthoritativeRead } from "../use-authoritative-read";
import { StaffCursorControls } from "./staff-cursor-controls";
import { staffOnboardingCopy } from "./staff-onboarding-copy";

export function StaffCreateLocations(props: {
  readonly selected: readonly string[];
  readonly onChange: (ids: string[]) => void;
  readonly disabled: boolean;
}) {
  const dashboard = useProtectedDashboard();
  const scope = administrationScope(dashboard.selectedScope);
  const scopeKey = administrationScopeKey(dashboard);
  const { locale } = useDashboardLocale();
  const t = administrationCopy(locale);
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const load = useCallback(
    (signal: AbortSignal) =>
      (scope.authority === "LOCATION_MANAGER"
        ? listLocationManagerLocations
        : listCompanyAdminLocations)(
        dashboard.api,
        scope.organizationId,
        cursor ? { cursor } : {},
        signal,
      ),
    [dashboard.api, scope.authority, scope.organizationId, cursor],
  );
  const page = useAuthoritativeRead(
    `${scopeKey}:staff-create-locations:${cursor ?? "first"}`,
    load,
  );
  return (
    <fieldset className={styles.stack} disabled={props.disabled}>
      <legend>
        {staffOnboardingCopy(locale).locations} ({props.selected.length}/50)
      </legend>
      <ReadState
        loading={page.loading}
        error={page.error}
        onRetry={page.refresh}
      >
        {(page.data?.items ?? []).map((item) => (
          <label className={styles.toolbar} key={item.locationId}>
            <span>
              <bdi dir="auto">{item.name}</bdi> ·{" "}
              <bdi dir="ltr">{item.code}</bdi>
              {item.status === "INACTIVE" ? ` · ${t.inactive}` : ""}
            </span>
            <input
              type="checkbox"
              checked={props.selected.includes(item.locationId)}
              disabled={
                (scope.authority === "LOCATION_MANAGER" &&
                  item.status !== "ACTIVE") ||
                (!props.selected.includes(item.locationId) &&
                  props.selected.length >= 50)
              }
              onChange={() =>
                props.onChange(
                  props.selected.includes(item.locationId)
                    ? props.selected.filter((id) => id !== item.locationId)
                    : [...props.selected, item.locationId],
                )
              }
            />
          </label>
        ))}
      </ReadState>
      <StaffCursorControls
        locale={locale}
        label={t.loadedCursorPage}
        loading={page.loading}
        canNext={Boolean(page.data?.nextCursor)}
        canPrevious={history.length > 0}
        onNext={() => {
          if (page.data?.nextCursor) {
            setHistory([...history, cursor]);
            setCursor(page.data.nextCursor);
          }
        }}
        onPrevious={() => {
          setCursor(history.at(-1) ?? null);
          setHistory(history.slice(0, -1));
        }}
      />
    </fieldset>
  );
}
