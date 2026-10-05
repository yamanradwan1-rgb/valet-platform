"use client";

import { useCallback, useState } from "react";
import { staffManagementDisplayName } from "@valet/contracts";
import { styles } from "../administration-ui";
import { useAuthoritativeRead } from "../use-authoritative-read";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import type { PresenceApi } from "./shift-presence-api";
import { presenceCopy } from "./shift-presence-copy";
import {
  PresencePagination,
  PresenceReadFeedback,
  presenceTime,
} from "./shift-presence-list-ui";
import { usePresenceExpiry } from "./use-presence-expiry";

export function ShiftPresenceExceptions(props: {
  readonly api: PresenceApi;
  readonly scopeKey: string;
  readonly epoch: number;
  readonly locale: DashboardLocale;
  readonly locationName: string;
  readonly onOpen: (id: string) => void;
}) {
  const t = presenceCopy(props.locale);
  const [view, setView] = useState<"PENDING" | "HISTORY">("PENDING");
  return (
    <div className={styles.cardPad} data-testid="presence-exceptions">
      <h3 className={styles.sectionTitle}>{t("exceptions")}</h3>
      <div className={styles.actions} role="group" aria-label={t("exceptions")}>
        {(["PENDING", "HISTORY"] as const).map((value) => (
          <button
            key={value}
            className={value === view ? styles.primary : styles.secondary}
            aria-pressed={value === view}
            onClick={() => setView(value)}
          >
            {t(value === "PENDING" ? "PENDING" : "history")}
          </button>
        ))}
      </div>
      <ExceptionPage {...props} key={view} view={view} />
    </div>
  );
}

function ExceptionPage(
  props: Parameters<typeof ShiftPresenceExceptions>[0] & {
    readonly view: "PENDING" | "HISTORY";
  },
) {
  const t = presenceCopy(props.locale);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const cursor = cursors[cursors.length - 1];
  const load = useCallback(
    (signal: AbortSignal) => props.api.exceptions(props.view, cursor, signal),
    [props.api, props.view, cursor],
  );
  const read = useAuthoritativeRead(
    `${props.scopeKey}:exceptions:${props.view}:${props.epoch}:${cursor ?? "first"}`,
    load,
  );
  const now = usePresenceExpiry(
    read.data?.items
      .filter((e) => e.status === "PENDING")
      .map((e) => e.expiresAt) ?? [],
    read.refresh,
  );
  return (
    <>
      <PresenceReadFeedback
        locale={props.locale}
        {...read}
        onRefresh={read.refresh}
      />
      {read.data ? (
        <>
          {read.data.items.length === 0 ? (
            <p className={styles.muted}>{t("noExceptions")}</p>
          ) : (
            <div
              className={styles.tableWrap}
              role="region"
              aria-label={t("exceptions")}
              tabIndex={0}
            >
              <table className={`${styles.table} ${styles.referenceTable}`}>
                <thead>
                  <tr>
                    {(
                      [
                        "employee",
                        "location",
                        "action",
                        "reason",
                        "requested",
                        "expires",
                        "status",
                        "actions",
                      ] as const
                    ).map((key) => (
                      <th key={key}>{t(key)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {read.data.items.map((e) => (
                    <tr key={e.exceptionId}>
                      <td>
                        <div className={styles.strong}>
                          {staffManagementDisplayName(e.requester)}
                        </div>
                        <bdi dir="ltr">{e.requester.email}</bdi>
                      </td>
                      <td>{props.locationName}</td>
                      <td>{t(e.action)}</td>
                      <td>{t(e.reason)}</td>
                      <td>
                        <time dateTime={e.requestedAt}>
                          {presenceTime(
                            e.requestedAt,
                            e.timezone,
                            props.locale,
                          )}
                        </time>
                      </td>
                      <td>
                        <time dateTime={e.expiresAt}>
                          {presenceTime(e.expiresAt, e.timezone, props.locale)}
                        </time>
                        {e.status === "PENDING" &&
                        Date.parse(e.expiresAt) <= now ? (
                          <p className={styles.muted}>{t("expiredHint")}</p>
                        ) : null}
                      </td>
                      <td>{t(e.status)}</td>
                      <td>
                        <button
                          className={styles.secondary}
                          disabled={read.loading}
                          onClick={() => props.onOpen(e.exceptionId)}
                        >
                          {t(
                            e.canReview &&
                              e.status === "PENDING" &&
                              Date.parse(e.expiresAt) > now
                              ? "review"
                              : "details",
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <PresencePagination
            locale={props.locale}
            previous={cursors.length > 1}
            next={read.data.nextCursor !== null}
            loading={read.loading}
            onPrevious={() => setCursors((values) => values.slice(0, -1))}
            onNext={() => {
              const next = read.data?.nextCursor;
              if (next) setCursors((values) => [...values, next]);
            }}
          />
        </>
      ) : null}
    </>
  );
}
