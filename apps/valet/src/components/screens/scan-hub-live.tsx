"use client";

import type { JSX } from "react";

import type { StartParkingPayload } from "../../features/check-in";
import type { Screen } from "../../types/employee-ui";
import { useEmployeeI18n } from "../shell/employee-i18n";
import type {
  ActiveParkingTarget,
  ActiveRetrievalTarget,
} from "../shell/employee-workspace";
import {
  keySlotGate,
  launchScanHubTile,
  licensePlateGate,
  parkingSpotGate,
  pickupHandoffGate,
  type ScanHubActionTile,
} from "../shell/scan-hub-tiles";
import { ScanHubLiveTile } from "./scan-hub-live-tile";

export interface ScanHubLiveProps {
  readonly nav: (s: Screen) => void;
  readonly parkingPayload: StartParkingPayload | null;
  readonly parkingTarget: ActiveParkingTarget | null;
  readonly retrievalTarget: ActiveRetrievalTarget | null;
}

/** White-stroke tile glyphs — deliberately NOT camera/scanner imagery. */
function PlateGlyph(): JSX.Element {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
      <rect
        x="2.5"
        y="7"
        width="21"
        height="12"
        rx="2.5"
        stroke="white"
        strokeWidth="1.6"
      />
      <path
        d="M7 13h3.5M15.5 13H19M13 10.5v5"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function KeyGlyph(): JSX.Element {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
      <circle cx="9" cy="14" r="5" stroke="white" strokeWidth="1.6" />
      <path
        d="M14 14h9M19.5 14v4M23 14v3"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SpotGlyph(): JSX.Element {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
      <path
        d="M13 23.5S5.5 17.6 5.5 11a7.5 7.5 0 0115 0c0 6.6-7.5 12.5-7.5 12.5z"
        stroke="white"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="13" cy="10.8" r="2.6" fill="white" />
    </svg>
  );
}

function HandoffGlyph(): JSX.Element {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
      <path
        d="M5.5 9.5h14m0 0l-3.5-3.5m3.5 3.5L16 13"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20.5 16.5h-14m0 0L10 13m-3.5 3.5L10 20"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Truthful Live Scan Hub (VUI-011B, DEC-066 §5): a context-aware launcher
 * over existing authoritative workflows only. No camera, no scanner, no
 * prototype operational data; disabled tiles explain themselves via i18n.
 */
export function ScanHubLive({
  nav,
  parkingPayload,
  parkingTarget,
  retrievalTarget,
}: ScanHubLiveProps): JSX.Element {
  const { t } = useEmployeeI18n();
  const parkingGate = parkingSpotGate(parkingTarget, parkingPayload);
  const retrievalGate = pickupHandoffGate(retrievalTarget);

  const openTile = (tile: ScanHubActionTile): void => {
    launchScanHubTile(tile, nav);
  };

  return (
    <div className="p-5">
      <h1 className="font-bold text-xl text-navy mb-1">{t.scanNav}</h1>
      <p className="text-neutral text-sm mb-6">{t.scanHubSubtitle}</p>
      <div className="grid grid-cols-2 gap-4">
        <ScanHubLiveTile
          accentClass="bg-vblue"
          disabled={!licensePlateGate().available}
          glyph={<PlateGlyph />}
          label={t.licensePlate}
          onSelect={() => openTile("licensePlate")}
          subtitle={t.scanHubLicensePlateSub}
        />
        <ScanHubLiveTile
          accentClass="bg-navy-3"
          disabled={!keySlotGate().available}
          glyph={<KeyGlyph />}
          label={t.keySlot}
          subtitle={t.scanHubKeySlotDisabled}
        />
        <ScanHubLiveTile
          accentClass="bg-vwarning"
          disabled={!parkingGate.available}
          glyph={<SpotGlyph />}
          label={t.parkingSpot}
          onSelect={() => openTile("parkingSpot")}
          subtitle={
            parkingGate.available
              ? t.scanHubParkingResume
              : t.scanHubParkingDisabled
          }
        />
        <ScanHubLiveTile
          accentClass="bg-vsuccess"
          disabled={!retrievalGate.available}
          glyph={<HandoffGlyph />}
          label={t.scanHubPickupLabel}
          onSelect={() => openTile("pickupHandoff")}
          subtitle={
            retrievalGate.available
              ? t.scanHubRetrievalResume
              : t.scanHubRetrievalDisabled
          }
        />
      </div>
    </div>
  );
}
