import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";

import type { InspectorResource } from "./resource-inspector-contract";
import type { inspectorCopy } from "./resource-inspector-copy";
import { ResourceInspectorCustody } from "./resource-inspector-custody";
import {
  resourceIsBusy,
  resourceState,
  resourceUsage,
  resourceVehicle,
} from "./resource-inspector-presentation";

type Copy = ReturnType<typeof inspectorCopy>;

function Spec(props: { readonly label: string; readonly children: React.ReactNode }) {
  return <div><dt>{props.label}</dt><dd>{props.children}</dd></div>;
}

export function ResourceInspectorDetail(props: {
  readonly item: InspectorResource | null;
  readonly locationName: string;
  readonly locationCode: string;
  readonly position: number;
  readonly total: number;
  readonly t: Copy;
  readonly api: DashboardApiClient;
  readonly locationId: string;
  readonly scopeKey: string;
  readonly onBack: () => void;
  readonly onQr: ((resourceId: string) => void) | undefined;
  readonly canLabel: boolean;
}) {
  const { item, t } = props;
  return (
    <section className="c-detail" aria-labelledby="c-detail-heading" tabIndex={-1} data-issue304-resource-detail>
      <div className="c-detail-topline">
        <button className="c-back" type="button" onClick={props.onBack}>
          <span aria-hidden="true">‹</span> {t.back}
        </button>
        <span className="c-overline">{t.selected}</span>
        <span className="c-position">
          {String(props.position).padStart(2, "0")} / {String(props.total).padStart(2, "0")}
        </span>
      </div>
      {item ? (
        <div className="c-detail-scroll">
          <div className="c-resource-hero">
            <div className="c-resource-icon" data-kind={item.family} aria-hidden="true">
              {item.family === "keys" ? "K" : "P"}
            </div>
            <div className="c-hero-copy">
              <div className="c-hero-prefix">
                {item.family === "keys" ? t.keySlot : t.parkingSpot} · <bdi dir="ltr">{props.locationCode}</bdi>
              </div>
              <h2 id="c-detail-heading"><bdi dir="ltr">{item.code}</bdi></h2>
              <p>{item.label || t.noLabel}</p>
            </div>
            <button
              className="c-qr-action"
              type="button"
              disabled={!props.canLabel || !props.onQr}
              onClick={() => props.onQr?.(item.id)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M15 14h2v3h-3v4h7v-4h-2"/></svg> {t.viewQR}
            </button>
          </div>

          <section className="c-vehicle" aria-label={t.associatedVehicle}>
            <div className="c-vehicle-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m5 10 2-4h10l2 4M4 10h16v7H4zM6.5 17v2m11-2v2M7 14h2m6 0h2"/></svg></div>
            <div className="c-vehicle-copy">
              <span className="c-stat-label">{t.associatedVehicle}</span>
              <strong><bdi dir={resourceVehicle(item, t).dir}>{resourceVehicle(item, t).label}</bdi></strong>
              <span>
                {item.status !== "ACTIVE" || item.usage === "UNKNOWN"
                  ? t.vehicleAssociationUnknown
                  : resourceIsBusy(item) ? t.vehicleCurrent : t.vehicleEmpty}
              </span>
            </div>
            <span className="c-vehicle-symbol" aria-hidden="true">↗</span>
          </section>

          <div className="c-stat-pair">
            <div className="c-stat-card">
              <span className="c-stat-label">{t.configStatus}</span>
              <div className="c-stat-value" data-kind={item.status === "ACTIVE" ? "available" : "inactive"}>
                <span className="c-status-dot" aria-hidden="true" />
                {item.status === "ACTIVE" ? t.active : t.inactive}
              </div>
              <p>{item.status === "ACTIVE" ? t.statusActive : t.statusInactive}</p>
            </div>
            <div className="c-stat-card">
              <span className="c-stat-label">{t.usageStatus}</span>
              <div className="c-stat-value" data-kind={resourceState(item)}>
                <span className="c-status-dot" aria-hidden="true" />
                {resourceUsage(item, t)}
              </div>
              <p>{item.status !== "ACTIVE" || item.usage === "UNKNOWN"
                ? t.usageUnknown : resourceIsBusy(item) ? t.usageBusy : t.usageFree}</p>
            </div>
          </div>

          <div className="c-lower-grid">
            <section className="c-detail-section" aria-labelledby="c-profile-title">
              <div className="c-section-title">
                <span className="c-section-index">01</span>
                <h3 id="c-profile-title">{t.resourceProfile}</h3>
              </div>
              <dl className="c-spec-list">
                <Spec label={t.code}><bdi className="c-mono" dir="ltr">{item.code}</bdi></Spec>
                <Spec label={t.label}>{item.label || t.noLabel}</Spec>
                <Spec label={t.location}>{props.locationName}</Spec>
                {item.family === "spots" ? (
                  <Spec label={t.parkingZone}>
                    {item.zone ? <>{item.zone.label} · <bdi className="c-mono" dir="ltr">{item.zone.code}</bdi></> : t.unassigned}
                  </Spec>
                ) : null}
              </dl>
            </section>
            <section className="c-detail-section c-timeline-section" aria-labelledby="c-timeline-title">
              <div className="c-section-title">
                <span className="c-section-index">02</span>
                <h3 id="c-timeline-title">{item.family === "keys" ? t.custody : t.parkingZone}</h3>
              </div>
              <p className="c-section-subtitle">
                {item.family === "keys" ? t.custodyIntro : t.spotIntro}
              </p>
              {item.family === "keys" ? (
                <ResourceInspectorCustody
                  api={props.api}
                  key={`${props.scopeKey}:${item.id}`}
                  keySlotId={item.id}
                  locationId={props.locationId}
                  scopeKey={props.scopeKey}
                  t={t}
                />
              ) : (
                <p className="c-empty-events">{item.zone ? item.zone.label : t.unassigned}</p>
              )}
            </section>
          </div>
          <div className="c-detail-bottom">
            <span className="c-foot-dot" aria-hidden="true" />
            <span>{t.readOnly}</span>
          </div>
        </div>
      ) : (
        <div className="c-preview-wash"><p>{t.none}</p></div>
      )}
    </section>
  );
}
