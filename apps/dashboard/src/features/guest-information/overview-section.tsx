import { GuestBadge, GuestCard, translate } from "./approved-elements";
import {
  policyStatus, type GuestInformationOverview, type GuestLanguage,
  type LocationPrivacy,
} from "./guest-information-model";

const statusLabels = {
  PUBLISHED: ["Published", "منشور"],
  UNAVAILABLE: ["Unavailable in this language", "غير متاح بهذه اللغة"],
  DRAFT: ["Draft", "مسودة"],
  NOT_SET: ["Not set", "غير مُعدّ"],
} as const;
const listStatusLabels = {
  ...statusLabels,
  UNAVAILABLE: ["Not available", "غير متاح"],
} as const;

export function OverviewSection({
  locale, overview, locationId, locationName, privacy, configured, active,
  customized, onSelectLocation, onReviewPrivacy,
}: {
  readonly locale: GuestLanguage;
  readonly active: boolean;
  readonly overview: GuestInformationOverview;
  readonly locationId: string;
  readonly locationName: string;
  readonly privacy: LocationPrivacy;
  readonly configured: number;
  readonly customized: number;
  readonly onSelectLocation: (locationId: string) => void;
  readonly onReviewPrivacy: () => void;
}) {
  const status = policyStatus(privacy, locale);
  const metrics = [
    {
      title: translate(locale, "Company · published locations", "الشركة · مواقع منشورة"),
      count: overview.publishedCount,
      total: overview.locations.length,
    },
    {
      title: translate(locale, "This location · contact fields", "هذا الموقع · حقول التواصل"),
      count: configured,
      total: 4,
    },
    {
      title: translate(locale, "This location · custom fields", "هذا الموقع · حقول مخصصة"),
      count: customized,
      total: 4,
    },
  ];
  return (
    <section className="opt2-view" id="opt2-overview" data-view="overview"
      aria-labelledby="opt2-title-overview" tabIndex={-1}
      hidden={!active} aria-hidden={!active}>
      <div className="opt2-intro">
        <h2 id="opt2-title-overview">
          {translate(locale, "At a glance", "نظرة سريعة")}
        </h2>
      </div>
      <div className="opt2-widgets">
        <div data-widget="summary">
          <GuestCard title={translate(locale, "Configuration status", "حالة الإعدادات")}
            subtitle={locationName}>
            <div className="v-metrics">
              {metrics.map((metric) => (
                <div className="v-metric" key={metric.title}>
                  <span className="v-small">{metric.title}</span>
                  <strong>{metric.count}<span> / {metric.total}</span></strong>
                </div>
              ))}
            </div>
          </GuestCard>
        </div>
      </div>
      <div className="opt2-next">
        <div className="opt2-next-copy">
          <h3>{translate(locale, "Privacy policy", "سياسة الخصوصية")}</h3>
          <div data-widget="privacy-status">
            <span className="v-compact-status" role="status">
              <span className="v-small">
                {translate(locale, "Location privacy", "خصوصية الموقع")}
              </span>{" "}
              <GuestBadge kind={status === "PUBLISHED" ? "good" : "neutral"}>
                {translate(locale, statusLabels[status][0], statusLabels[status][1])}
              </GuestBadge>
            </span>
          </div>
        </div>
        <button type="button" data-view-target="privacy" onClick={onReviewPrivacy}>
          {translate(locale, "Review privacy", "مراجعة الخصوصية")}
        </button>
      </div>
      <details className="opt2-more">
        <summary>
          {translate(locale, "Choose another demo location", "اختيار موقع تجريبي آخر")}
        </summary>
        <div className="opt2-widgets">
          <div data-widget="locations">
            <GuestCard title={translate(locale, "Locations", "المواقع")}
              subtitle={translate(locale, "Choose where to work", "اختر الموقع")}>
              <div className="v-location-list" role="group"
                aria-label={translate(locale, "Demo Locations", "المواقع التجريبية")}>
                {overview.locations.map((item) => (
                  <button type="button" key={item.id} className="v-location-item"
                    aria-pressed={item.id === locationId}
                    onClick={() => onSelectLocation(item.id)}>
                    <strong>{item.name}</strong>
                    <span className="v-location-status">
                      <span>{translate(locale, "Privacy", "الخصوصية")}:{" "}
                        <b>{translate(locale, listStatusLabels[item.privacy][0],
                          listStatusLabels[item.privacy][1])}</b>
                      </span>
                      <span>{translate(locale, "Contact", "التواصل")}:{" "}
                        <b>{item.contact === "AVAILABLE"
                          ? translate(locale, "Available", "متاح")
                          : translate(locale, "Not set", "غير مُعدّ")}</b>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </GuestCard>
          </div>
        </div>
      </details>
    </section>
  );
}
