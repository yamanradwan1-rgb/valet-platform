import type { PresenceLocation } from "./shift-presence-api";
import { presenceCopy } from "./shift-presence-copy";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import { styles } from "../administration-ui";

export function ShiftPresenceReadiness({
  data,
  locale,
}: {
  readonly data: PresenceLocation;
  readonly locale: DashboardLocale;
}) {
  const t = presenceCopy(locale);
  const r = data.readiness;
  const status =
    r.applicability === "NOT_APPLICABLE"
      ? "notApplicable"
      : r.configurationUsable &&
          (r.applicability === "WARNING" || r.strictActivationAllowed)
        ? "ready"
        : "notReady";
  return (
    <div className={styles.cardPad} data-testid="presence-readiness">
      <h3 className={styles.sectionTitle}>
        {t("readiness")}: {t(status)}
      </h3>
      <p className={styles.sectionText}>
        {t("start")}: {t(data.effective.startMode)} · {t("end")}:{" "}
        {t(data.effective.endMode)}
      </p>
      <p className={styles.sectionText}>
        {t("zoneCount")}: {r.activeZoneCount}
      </p>
      {r.blockers.map((blocker) => (
        <p className={styles.sectionText} key={blocker}>
          {t(blocker)}
        </p>
      ))}
      <p className={styles.sectionText}>
        {t("company")} {t("revision")}: {r.companyRevision} · {t("location")}{" "}
        {t("revision")}: {r.locationRevision}
      </p>
      <p className={styles.sectionText}>
        {t("observed")}:{" "}
        <time dateTime={r.observedAt}>
          {new Intl.DateTimeFormat(locale, {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: data.timezone,
          }).format(new Date(r.observedAt))}
        </time>
      </p>
    </div>
  );
}
