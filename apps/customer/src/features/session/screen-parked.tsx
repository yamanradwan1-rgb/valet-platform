import React from "react";

import { useTranslation } from "../../i18n/use-translation";
import { InfoRow } from "../../components/primitives/info-row";
import { StatusBadge } from "../../components/primitives/status-badge";
import { TrustStrip } from "../../components/primitives/trust-strip";
import { VehicleHero } from "../../components/primitives/vehicle-hero";
import { Btn } from "../../components/primitives/btn";
import type { GuestSafeSession } from "../../lib/api/guest-api-types";
import { C } from "../../lib/theme/colors";
import { guestBrandDisplayName } from "./guest-branding";

export function ScreenParked({
  session,
  onRequestClick,
  onViewDetails,
  canRequest = true,
}: {
  readonly session: GuestSafeSession;
  readonly onRequestClick: () => void;
  readonly onViewDetails: () => void;
  readonly canRequest?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="screen-enter"
      style={{
        paddingLeft: 20,
        paddingRight: 20,
        paddingTop: 24,
        paddingBottom: 32,
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <StatusBadge status="success" label={t("parked.badge")} />

      <VehicleHero
        make={session.vehicle.make}
        model={session.vehicle.model}
        color={session.vehicle.color}
      />

      <div style={{ borderTop: `1px solid ${C.borderSemantic}` }}>
        <InfoRow
          label={t("parked.locationLabel")}
          value={guestBrandDisplayName(session) ?? t("parked.locationValue")}
        />
        <InfoRow
          label={t("parked.statusLabel")}
          value={t("parked.statusValue")}
          showBorder={false}
        />
      </div>

      <TrustStrip />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          paddingTop: 4,
        }}
      >
        <Btn onClick={onRequestClick} disabled={!canRequest}>{t("parked.requestButton")}</Btn>
        <Btn onClick={onViewDetails} variant="ghost">
          {t("vehicle.viewDetails")}
        </Btn>
      </div>
    </div>
  );
}
