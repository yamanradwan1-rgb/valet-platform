import type { DashboardLocale } from "../../lib/i18n/locale";
import styles from "./visit-contacts.module.css";

import { formatVisitContactTime } from "./visit-contact-time-format";

export function VisitContactTime(props: {
  readonly value: string | null;
  readonly locale: DashboardLocale;
}) {
  if (props.value === null) return <>—</>;
  return (
    <time dateTime={props.value}>
      <span>{formatVisitContactTime(props.value, props.locale)}</span>
      <br />
      <bdi className={styles.muted} dir="ltr">
        {props.value}
      </bdi>
    </time>
  );
}
