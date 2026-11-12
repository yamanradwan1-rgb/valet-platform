import { uxCopy } from "./ux-copy";
import {
  SYNTHETIC_INCIDENT_SOURCE_ID,
  SYNTHETIC_INCIDENT_TARGET_ID,
  type Locale,
  type SyntheticAlert,
  type SyntheticDestination,
} from "./types";

export function SyntheticDestinationStatus({
  destination,
  locale,
}: {
  destination: SyntheticDestination;
  locale: Locale;
}) {
  const t = uxCopy[locale];
  if (destination.state === "available") return null;

  const label = destination.state === "unavailable"
    ? t.destinationUnavailable
    : destination.state === "missing" ? t.destinationMissing : t.destinationUnauthorized;
  return (
    <span
      className="destination-unavailable"
      data-testid="synthetic-destination-status"
      data-destination-state={destination.state}
      data-source-id={destination.sourceId}
      data-target-id={"targetId" in destination ? destination.targetId : undefined}
    >
      {label}
    </span>
  );
}

export function SyntheticDestinationPreview({
  items,
  locale,
}: {
  items: SyntheticAlert[];
  locale: Locale;
}) {
  const hasSupportedTarget = items.some((item) =>
    item.destination.state === "available" &&
    item.destination.sourceId === SYNTHETIC_INCIDENT_SOURCE_ID &&
    item.destination.targetId === SYNTHETIC_INCIDENT_TARGET_ID,
  );
  if (!hasSupportedTarget) return null;

  const t = uxCopy[locale];
  return (
    <section
      className="alert-card"
      id={SYNTHETIC_INCIDENT_TARGET_ID}
      tabIndex={-1}
      role="region"
      aria-labelledby="synthetic-destination-preview-title"
      data-testid="synthetic-destination-preview"
      data-destination-state="available"
    >
      <div className="alert-card-top">
        <span className="alert-kind">{t.simulated}</span>
      </div>
      <div className="alert-card-content">
        <div className="alert-card-text">
          <h3
            id="synthetic-destination-preview-title"
            style={{ margin: 0, fontSize: "0.8rem", lineHeight: 1.45, fontWeight: 750 }}
          >
            {t.destinationPreviewTitle}
          </h3>
          <span className="alert-description">{t.destinationPreviewNotice}</span>
        </div>
      </div>
      <div className="alert-card-bottom">
        <span className="alert-meta">{t.sourceIdLabel}: <bdi dir="ltr"><code>{SYNTHETIC_INCIDENT_SOURCE_ID}</code></bdi></span>
        <span className="alert-meta">{t.targetIdLabel}: <bdi dir="ltr"><code>{SYNTHETIC_INCIDENT_TARGET_ID}</code></bdi></span>
      </div>
    </section>
  );
}
