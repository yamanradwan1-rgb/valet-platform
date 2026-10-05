"use client";
import { presenceId } from "./shift-presence-id";

import { useCallback, useState } from "react";
import { styles } from "../administration-ui";
import { useAuthoritativeRead } from "../use-authoritative-read";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import type { PresenceApi } from "./shift-presence-api";
import { presenceCopy } from "./shift-presence-copy";
import type { ZoneDialogTarget } from "./shift-presence-zone-dialog";
import {
  PresencePagination,
  PresenceReadFeedback,
} from "./shift-presence-list-ui";

export function ShiftPresenceZones(props: {
  readonly api: PresenceApi;
  readonly scopeKey: string;
  readonly epoch: number;
  readonly locale: DashboardLocale;
  readonly disabled: boolean;
  readonly onOpen: (target: ZoneDialogTarget) => void;
}) {
  const t = presenceCopy(props.locale);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const cursor = cursors[cursors.length - 1];
  const load = useCallback(
    (signal: AbortSignal) => props.api.zones(cursor, signal),
    [props.api, cursor],
  );
  const read = useAuthoritativeRead(
    `${props.scopeKey}:zones:${props.epoch}:${cursor ?? "first"}`,
    load,
  );
  function open(id: string, create: boolean, mode: ZoneDialogTarget["mode"]) {
    props.onOpen({ id, create, mode, generation: presenceId() });
  }
  return (
    <div className={styles.cardPad} data-testid="presence-zones">
      <div className={styles.toolbar}>
        <h3 className={styles.sectionTitle}>{t("zones")}</h3>
        <button
          className={styles.primary}
          disabled={props.disabled}
          onClick={() => open(presenceId(), true, "edit")}
        >
          {t("add")}
        </button>
      </div>
      <PresenceReadFeedback
        locale={props.locale}
        {...read}
        onRefresh={read.refresh}
      />
      {read.data ? (
        <>
          {read.data.items.length === 0 ? (
            <p className={styles.muted}>{t("noZones")}</p>
          ) : (
            <div
              className={styles.tableWrap}
              role="region"
              aria-label={t("zones")}
              tabIndex={0}
            >
              <table className={`${styles.table} ${styles.referenceTable}`}>
                <thead>
                  <tr>
                    {(
                      [
                        "label",
                        "code",
                        "status",
                        "radius",
                        "revision",
                        "actions",
                      ] as const
                    ).map((label) => (
                      <th key={label}>{t(label)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {read.data.items.map((zone) => (
                    <tr key={zone.id}>
                      <td>{zone.label}</td>
                      <td>
                        <bdi dir="ltr">{zone.code}</bdi>
                      </td>
                      <td>{t(zone.state)}</td>
                      <td>
                        <bdi dir="ltr">{zone.radiusMeters}</bdi>
                      </td>
                      <td>{zone.revision}</td>
                      <td>
                        <div className={styles.actions}>
                          <button
                            className={styles.secondary}
                            disabled={props.disabled || read.loading}
                            onClick={() => open(zone.id, false, "edit")}
                          >
                            {t("edit")}
                          </button>
                          <button
                            className={styles.secondary}
                            disabled={props.disabled || read.loading}
                            onClick={() =>
                              open(
                                zone.id,
                                false,
                                zone.state === "ACTIVE" ? "disable" : "enable",
                              )
                            }
                          >
                            {t(zone.state === "ACTIVE" ? "disable" : "enable")}
                          </button>
                        </div>
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
              if (read.data?.nextCursor)
                setCursors((values) => [...values, read.data!.nextCursor!]);
            }}
          />
        </>
      ) : null}
    </div>
  );
}
