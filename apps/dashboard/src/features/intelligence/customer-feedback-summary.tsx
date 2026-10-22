import type { CustomerFeedbackAnalyticsResponse } from "@valet/contracts";

import type { DashboardLocale } from "../../lib/i18n/locale";
import { customerFeedbackCopy, feedbackNumber } from "./customer-feedback-copy";
import styles from "./customer-feedback.module.css";

type SummaryData = Pick<CustomerFeedbackAnalyticsResponse,
  "averageRating" | "participationRate" | "ratedVisits" | "eligibleCompletedVisits">;

export function CustomerFeedbackSummary(props: { readonly data: SummaryData; readonly locale: DashboardLocale }) {
  const { data } = props;
  const t = customerFeedbackCopy(props.locale);
  const average = data.averageRating === null ? null : Number(data.averageRating);
  const participation = data.participationRate === null ? null : Number(data.participationRate);
  const progress = participation === null ? null : Math.round(participation * 100);
  const roundedStars = average === null ? 0 : Math.max(0, Math.min(5, Math.round(average)));

  return (
    <div className={styles.surface} data-testid="feedback-state" data-state="ready">
      <div className={styles.summary}>
        <div className={styles.score}>
          <p className={styles.eyebrow}>{t.average}</p>
          <div className={styles.averageLine} dir="ltr">
            <span className={styles.average} data-testid="feedback-avg">{average === null ? "—" : average.toFixed(2)}</span>
            <span className={styles.outOf}>/ 5</span>
          </div>
          <div className={styles.stars} aria-hidden="true">
            {"★".repeat(roundedStars)}{"☆".repeat(5 - roundedStars)}
          </div>
          <p className={styles.scoreCaption}>
            {average === null ? t.unavailable : t.ratings} · <bdi dir="ltr">{feedbackNumber(data.ratedVisits)}</bdi>
          </p>
          {average === null ? (
            <p className={styles.note}>{data.eligibleCompletedVisits > 0 ? t.noRatings : t.noEligible}</p>
          ) : null}
        </div>
        <div className={styles.coverage}>
          <div>
            <p className={styles.eyebrow}>{t.participation}</p>
            <div className={styles.coverageLine}>
              <bdi className={styles.coverageFraction} dir="ltr">
                <span data-testid="feedback-sample-count">{feedbackNumber(data.ratedVisits)}</span>
                {" / "}
                <span data-testid="feedback-eligible-count">{feedbackNumber(data.eligibleCompletedVisits)}</span>
              </bdi>
              <span className={styles.coverPercent} dir="ltr">
                {progress === null ? t.unavailable : `${progress}%`}
              </span>
            </div>
            <p className={styles.coverageCopy}>{t.coverage}</p>
          </div>
          <div
            className={styles.track}
            {...(progress === null
              ? { "aria-hidden": true as const }
              : {
                  role: "progressbar" as const,
                  "aria-label": t.participation,
                  "aria-valuemin": 0,
                  "aria-valuemax": 100,
                  "aria-valuenow": progress,
                })}
          >
            <span style={{ width: `${participation === null ? 0 : participation * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
