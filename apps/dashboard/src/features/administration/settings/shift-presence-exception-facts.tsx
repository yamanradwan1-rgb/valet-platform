import { staffManagementDisplayName } from "@valet/contracts";
import type { PresenceException } from "./shift-presence-api";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import { presenceCopy } from "./shift-presence-copy";
import { presenceTime } from "./shift-presence-list-ui";
import { styles } from "../administration-ui";

export function ShiftPresenceExceptionFacts(props: {
  readonly data: PresenceException;
  readonly locationName: string;
  readonly locale: DashboardLocale;
}) {
  const t = presenceCopy(props.locale);
  const e = props.data;
  return (
    <div className={styles.field}>
      <div className={styles.strong}>
        {staffManagementDisplayName(e.requester)}
      </div>
      <div>
        <bdi dir="ltr">{e.requester.email}</bdi>
      </div>
      <p>
        {t(e.action)} · {props.locationName}
      </p>
      <p>
        {t("reason")}: {t(e.reason)}
      </p>
      <p>
        {t("status")}: {t(e.status)} · {t("revision")}: {e.revision}
      </p>
      <p>
        {t("requested")}:{" "}
        <time dateTime={e.requestedAt}>
          {presenceTime(e.requestedAt, e.timezone, props.locale)}
        </time>
      </p>
      <p>
        {t("expires")}:{" "}
        <time dateTime={e.expiresAt}>
          {presenceTime(e.expiresAt, e.timezone, props.locale)}
        </time>
      </p>
    </div>
  );
}
