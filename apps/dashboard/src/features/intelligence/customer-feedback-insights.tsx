import type { CustomerFeedbackAnalyticsResponse } from "@valet/contracts";

import type { DashboardLocale } from "../../lib/i18n/locale";
import { customerFeedbackCopy, feedbackDate, feedbackNumber } from "./customer-feedback-copy";
import styles from "./customer-feedback.module.css";

type InsightsData = Pick<CustomerFeedbackAnalyticsResponse,
  "distribution" | "ratedVisits" | "eligibleCompletedVisits" | "recentRatings">;

export function CustomerFeedbackInsights(props: { readonly data: InsightsData; readonly locale: DashboardLocale }) {
  const { data, locale } = props;
  const t = customerFeedbackCopy(locale);
  const distribution = [
    { star: 5, count: data.distribution.five },
    { star: 4, count: data.distribution.four },
    { star: 3, count: data.distribution.three },
    { star: 2, count: data.distribution.two },
    { star: 1, count: data.distribution.one },
  ];
  const empty = data.eligibleCompletedVisits > 0 ? t.noRatings : t.noEligible;

  return (
    <div className={styles.insights}>
      <section className={styles.insightCard} aria-labelledby="feedback-distribution-heading">
        <h3 className={styles.insightTitle} id="feedback-distribution-heading">{t.distribution}</h3>
        <div className={styles.distribution} data-testid="feedback-distribution" role="list">
          {distribution.map(({ star, count }) => (
            <div
              aria-label={`${star} ${star === 1 ? t.star : t.stars}: ${feedbackNumber(count)}`}
              className={styles.distRow}
              key={star}
              role="listitem"
            >
              <span className={styles.distStar} dir="ltr">{star} <span aria-hidden="true">★</span></span>
              <div className={styles.distTrack} aria-hidden="true">
                <span style={{ width: `${data.ratedVisits > 0 ? count / data.ratedVisits * 100 : 0}%` }} />
              </div>
              <bdi className={styles.distCount} dir="ltr">{feedbackNumber(count)}</bdi>
            </div>
          ))}
        </div>
        <p className={styles.note}>{t.ratings}: <bdi dir="ltr">{feedbackNumber(data.ratedVisits)}</bdi></p>
      </section>

      <section className={styles.insightCard} aria-labelledby="feedback-recent-heading">
        <h3 className={styles.insightTitle} id="feedback-recent-heading">{t.recent}</h3>
        <div className={styles.recentList} data-testid="feedback-recent-list" role="list">
          {data.recentRatings.length > 0 ? data.recentRatings.slice(0, 4).map((record) => (
            <div className={styles.recentItem} key={record.visitReference} role="listitem">
              <div>
                <div className={styles.recentId} dir="ltr">{record.visitReference}</div>
                <p className={styles.recentMeta}>
                  {record.authorizedLocationLabel} · {t.completed}{" "}
                  <span>{feedbackDate(record.completedAt, record.locationTimezone, locale)}</span>
                  <br />
                  {t.submitted}{" "}
                  <span>{feedbackDate(record.ratedAt, record.locationTimezone, locale)}</span>
                </p>
              </div>
              <span
                aria-label={`${record.rating} ${record.rating === 1 ? t.star : t.stars}`}
                className={styles.ratingChip}
                role="img"
              >
                {record.rating} <span aria-hidden="true">★</span>
              </span>
            </div>
          )) : <p className={styles.empty}>{empty}</p>}
        </div>
      </section>
    </div>
  );
}
