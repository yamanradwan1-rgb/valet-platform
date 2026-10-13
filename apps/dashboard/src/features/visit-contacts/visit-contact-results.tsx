"use client";

import { MoreHorizontal } from "lucide-react";
import type { ManagementVisitContactSearchResponse } from "@valet/contracts";

import type { VisitContactCopy } from "./visit-contact-copy";
import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { VisitContactTime } from "./visit-contact-time";
import { visitContactPhoneText } from "./visit-contact-presentation";
import { ScopedContextHelp } from "../help/scoped-context-help";
import helpSlot from "../help/help-slot.module.css";
import baseStyles from "./visit-contacts.module.css";
import tableStyles from "./visit-contact-table.module.css";
const styles = { ...baseStyles, ...tableStyles };

export type VisitContactSearchItem =
  ManagementVisitContactSearchResponse["items"][number];

export function VisitContactResults(props: {
  readonly canNext: boolean;
  readonly canPrevious: boolean;
  readonly data: ManagementVisitContactSearchResponse;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly onSelect: (item: VisitContactSearchItem) => void;
  readonly t: VisitContactCopy;
}) {
  const { data, t } = props;
  const { locale } = useDashboardLocale();
  if (data.matchState === "NONE") {
    return (
      <div className={styles.card}>
        <div className={styles.state}>
          <span className={helpSlot.row}>
            <span>{t.none}</span>
            <ScopedContextHelp helpKey="contacts.results" />
          </span>
        </div>
        {data.mode !== "PLATE" ? (
          <div className={styles.pagination}>
            <span>{t.loaded} 0 {t.results}</span>
            <div className={styles.cursorButtons}>
              <button
                className={styles.secondary}
                disabled={!props.canPrevious}
                onClick={props.onPrevious}
                type="button"
              >
                {t.previous}
              </button>
              <button
                className={styles.secondary}
                disabled={!props.canNext}
                onClick={props.onNext}
                type="button"
              >
                {t.next}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <>
      <div className={styles.notice} role="status">
        {data.matchState === "AMBIGUOUS" ? t.ambiguous : t.unique}
      </div>
      <div className={styles.card}>
        <div
          aria-label={t.results}
          className={styles.tableWrap}
          role="region"
          tabIndex={0}
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t.result}</th>
                <th>{t.phone}</th>
                <th>{t.completedVisits}</th>
                <th>{t.latestVisit}</th>
                <th className={styles.actionCell}>{t.details}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, index) => (
                <tr
                  key={
                    item.kind === "CUSTOMER" ? item.customerId : item.vehicleId
                  }
                >
                  <td>
                    {item.kind === "CUSTOMER" ? (
                      <div>
                        <div className={styles.primaryText}>
                          {item.displayName ?? t.unavailableName}
                        </div>
                        <div className={styles.muted}>{t.customer}</div>
                      </div>
                    ) : (
                      <div>
                        <div className={styles.primaryText}>
                          <bdi dir="ltr">{item.plateNumberRaw}</bdi>
                        </div>
                        <div className={styles.muted}>
                          <bdi dir="ltr">{item.plateCountry}</bdi> · {t.vehicle}
                        </div>
                      </div>
                    )}
                  </td>
                  <td>
                    {item.kind === "CUSTOMER" ? (
                      <bdi dir="ltr">
                        {visitContactPhoneText(item.phone, t.maskedPhone)}
                      </bdi>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{item.completedVisitCount}</td>
                  <td>
                    {item.latestVisit ? (
                      <>
                        <span>{item.latestVisit.locationName}</span>
                        <br />
                        <VisitContactTime
                          value={item.latestVisit.createdAt}
                          locale={locale}
                        />
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={styles.actionCell}>
                    <button
                      aria-label={`${t.detailsForResult} ${index + 1}: ${
                        item.kind === "CUSTOMER"
                          ? (item.displayName ?? t.unavailableName)
                          : item.plateNumberRaw
                      }`}
                      className={styles.detail}
                      onClick={() => props.onSelect(item)}
                      type="button"
                    >
                      <MoreHorizontal aria-hidden="true" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.pagination}>
          <span className={helpSlot.row}>
            <span>{t.loaded} {data.items.length} {t.results}</span>
            <ScopedContextHelp helpKey="contacts.results" />
          </span>
          {data.mode !== "PLATE" ? (
            <div className={styles.cursorButtons}>
              <button
                className={styles.secondary}
                disabled={!props.canPrevious}
                onClick={props.onPrevious}
                type="button"
              >
                {t.previous}
              </button>
              <button
                className={styles.secondary}
                disabled={!props.canNext}
                onClick={props.onNext}
                type="button"
              >
                {t.next}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
