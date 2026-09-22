"use client";

import { useEffect } from "react";

import { useDashboardLocale } from "../../lib/i18n/locale-provider";
import { visitContactCopy } from "./visit-contact-copy";
import {
  isVisitContactAuthorityLoss,
  visitContactErrorMessage,
} from "./visit-contact-errors";
import styles from "./visit-contacts.module.css";
import { useVisitHistory, type VisitHistorySubject } from "./use-visit-history";

export type { VisitHistorySubject } from "./use-visit-history";

function phoneText(
  phone: { readonly kind: "FULL"; readonly value: string } |
    { readonly kind: "MASKED"; readonly ending: string } | null,
  masked: string,
) {
  if (phone === null) return "—";
  return phone.kind === "FULL" ? phone.value : `${masked} ${phone.ending}`;
}

function VisitHistoryContent({
  onAuthorityLoss,
  subject,
}: {
  readonly onAuthorityLoss?: (reason: unknown) => void;
  readonly subject: VisitHistorySubject;
}) {
  const { locale } = useDashboardLocale();
  const t = visitContactCopy(locale);
  const history = useVisitHistory(subject);
  useEffect(() => {
    if (isVisitContactAuthorityLoss(history.error)) onAuthorityLoss?.(history.error);
  }, [history.error, onAuthorityLoss]);
  if (history.loading) return <div className={styles.state}>{t.loading}</div>;
  if (history.error) {
    return (
      <div className={styles.error} role="alert">
        <span>{visitContactErrorMessage(history.error, t)}</span>
        <button className={styles.secondary} onClick={history.retry} type="button">{t.retry}</button>
      </div>
    );
  }
  if (!history.data || history.data.items.length === 0) {
    return (
      <div className={styles.card}>
        <div className={styles.state}>{t.noHistory}</div>
        <div className={styles.pagination}>
          <span>{t.loaded} 0 {t.results}</span>
          <div className={styles.cursorButtons}>
            <button className={styles.secondary} disabled={!history.canPrevious} onClick={history.previous} type="button">{t.previous}</button>
            <button className={styles.secondary} disabled={!history.canNext} onClick={history.next} type="button">{t.next}</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.card}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr><th>{t.location}</th><th>{t.state}</th><th>{t.phone}</th><th>{t.returningContact}</th><th>{t.completed}</th></tr></thead>
          <tbody>
            {history.data.items.map((item) => (
              <tr key={item.valetSessionId}>
                <td>
                  <span className={styles.primaryText}>{item.locationName}</span>
                  <br /><bdi className={styles.muted} dir="ltr">{item.valetSessionId}</bdi>
                </td>
                <td><bdi dir="ltr">{item.state}</bdi></td>
                <td>
                  {item.customerId === null
                    ? t.customerless
                    : <bdi dir="ltr">{phoneText(item.phone, t.maskedPhone)}</bdi>}
                </td>
                <td>{item.returningContact ? t.returningContact : "—"}</td>
                <td><bdi dir="ltr">{item.completedAt ?? "—"}</bdi></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.pagination}>
        <span>{t.loaded} {history.data.items.length} {t.results}</span>
        <div className={styles.cursorButtons}>
          <button className={styles.secondary} disabled={!history.canPrevious} onClick={history.previous} type="button">{t.previous}</button>
          <button className={styles.secondary} disabled={!history.canNext} onClick={history.next} type="button">{t.next}</button>
        </div>
      </div>
    </div>
  );
}

export function VisitHistory({
  onAuthorityLoss,
  subject,
}: {
  readonly onAuthorityLoss?: (reason: unknown) => void;
  readonly subject: VisitHistorySubject;
}) {
  return (
    <VisitHistoryContent
      key={`${subject.kind}:${subject.id}`}
      {...(onAuthorityLoss ? { onAuthorityLoss } : {})}
      subject={subject}
    />
  );
}

export function AuthorizedVehicleHistory({ vehicleId }: { readonly vehicleId: string }) {
  return <VisitHistory subject={{ id: vehicleId, kind: "VEHICLE" }} />;
}
