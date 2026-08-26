"use client";

import { PageHeader } from "../../components/ui/page-header";
import { useTranslation } from "../../i18n/locale-provider";
import type { LatestRequestSnapshot } from "../../lib/api/latest-request-gate";
import type {
  SubscriptionEntitlements,
  LocationSubscriptionResponse,
} from "@valet/contracts";

import {
  SUBSCRIPTION_ENTITLEMENT_ORDER,
  entitlementLabelKey,
  subscriptionFailureMessageKey,
  subscriptionStatusLabelKey,
} from "./subscription-state";
import { useSubscription } from "./use-subscription";
import "./subscription.css";

/**
 * /subscription surface (D4-004): strictly read-only backend facts.
 *
 * Shows ONLY what the backend returns — planCode (an opaque identifier,
 * never turned into a marketing name), status, and the three entitlement
 * booleans. There are no prices, billing cycles, renewal dates, trial ends,
 * seats, payment methods or actions of any kind because the backend defines
 * none. A null subscription renders a neutral truthful state; it is never
 * interpreted as cancelled/expired/free/failure.
 *
 * LOCATION IDENTITY BOUNDARY: the whole fact surface is KEYED by the
 * selected authorized location id; switching A→B unmounts A's facts before
 * B's load starts, and the loader drops any late A response by sequence, so
 * A's data can never render under B.
 */
export function SubscriptionView() {
  const { t } = useTranslation();
  const subscription = useSubscription();
  const locationKey =
    subscription.locationId.length > 0 ? subscription.locationId : "none";

  return (
    <div className="page-shell">
      <PageHeader
        description={t("page.subscription.description")}
        title={t("page.subscription.title")}
      />
      <p className="contract-note">{t("subscription.note")}</p>
      <SubscriptionSurface
        key={locationKey}
        snapshot={subscription.snapshot}
        retry={subscription.retry}
      />
    </div>
  );
}

export function SubscriptionSurface(props: {
  retry: () => void;
  snapshot: LatestRequestSnapshot<LocationSubscriptionResponse>;
}) {
  const { t } = useTranslation();
  const { retry, snapshot } = props;

  if (snapshot.phase === "loading") {
    return (
      <div className="subscription-loading" role="status">
        {t("subscription.state.loading")}
      </div>
    );
  }

  if (snapshot.phase === "error") {
    return (
      <div className="error-state" role="alert">
        <p>{t(subscriptionFailureMessageKey(snapshot.error))}</p>
        <button type="button" className="btn-secondary" onClick={retry}>
          {t("common.retry")}
        </button>
      </div>
    );
  }

  const data = snapshot.data;
  if (data === null) {
    // Idle (no authorized location yet): keep an honest loading posture
    // instead of rendering facts that do not exist.
    return (
      <div className="subscription-loading" role="status">
        {t("subscription.state.loading")}
      </div>
    );
  }
  if (data.subscription === null) {
    // Neutral truthful state only: the backend says nothing more about an
    // organization without a subscription record.
    return (
      <section aria-label={t("subscription.none.title")} className="subscription-card">
        <h2>{t("subscription.none.title")}</h2>
        <p>{t("subscription.none.body")}</p>
      </section>
    );
  }

  const sub = data.subscription;
  return (
    <section
      aria-label={t("page.subscription.title")}
      className="subscription-facts"
      data-testid="subscription-present"
    >
      <dl className="subscription-metadata">
        <div>
          <dt>{t("subscription.fields.plan")}</dt>
          <dd>
            <bdi className="subscription-mono" dir="ltr">
              {sub.planCode}
            </bdi>
          </dd>
        </div>
        <div>
          <dt>{t("subscription.fields.status")}</dt>
          <dd>{t(subscriptionStatusLabelKey(sub.status))}</dd>
        </div>
      </dl>

      <EntitlementList entitlements={sub.entitlements} />
    </section>
  );
}

function EntitlementList({
  entitlements,
}: {
  entitlements: SubscriptionEntitlements;
}) {
  const { t } = useTranslation();
  return (
    <div className="subscription-entitlements">
      <h2>{t("subscription.entitlements.heading")}</h2>
      <ul>
        {SUBSCRIPTION_ENTITLEMENT_ORDER.map((name) => (
          <li key={name} data-testid={`subscription-entitlement-${name}`}>
            <span className="subscription-entitlement-name">
              {t(entitlementLabelKey(name))}
            </span>
            <span className="subscription-entitlement-state">
              {entitlements[name]
                ? t("subscription.entitlement.available")
                : t("subscription.entitlement.unavailable")}
            </span>
          </li>
        ))}
      </ul>
      <p className="subscription-hint">
        {t("subscription.entitlements.hint")}
      </p>
    </div>
  );
}
