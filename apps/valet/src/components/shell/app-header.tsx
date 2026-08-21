import type { JSX } from "react";
import type { StaffOperationalRole } from "@valet/contracts";

export interface AppHeaderProps {
  readonly mode?: "live" | "prototype" | undefined;
  readonly locationName?: string | undefined;
  readonly locationCode?: string | undefined;
  readonly role?: StaffOperationalRole | undefined;
  readonly onAvatarTap?: (() => void) | undefined;
}

export function AppHeader({
  mode = "prototype",
  locationName,
  locationCode,
  role,
  onAvatarTap,
}: AppHeaderProps): JSX.Element {
  const isLive = mode === "live";

  const displayLocation = isLive
    ? (locationName ?? "")
    : (locationName ?? "Four Seasons Amman");

  const displayCode = isLive
    ? (locationCode ?? "")
    : (locationCode ?? "Main Entrance");

  const displayInitials = isLive
    ? role === "VALET_EMPLOYEE"
      ? "VE"
      : role === "VALET_SUPERVISOR"
        ? "VS"
        : ""
    : role === "VALET_EMPLOYEE"
      ? "VE"
      : role === "VALET_SUPERVISOR"
        ? "VS"
        : "MK";

  return (
    <header className="bg-white border-b border-vborder px-5 h-16 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-3">
        <img
          src="/brand/VAYLET_Logo_Light_Background.png"
          alt="VAYLET"
          className="h-7 object-contain"
        />
        <div className="h-5 w-px bg-vborder" />
        <div>
          <p className="text-navy text-[13px] font-semibold leading-tight">
            {displayLocation}
          </p>
          <p className="text-neutral text-[11px] leading-tight">
            {displayCode}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onAvatarTap}
        className="w-9 h-9 rounded-full bg-navy-3 flex items-center justify-center cursor-pointer active:opacity-70"
      >
        <span className="font-heading font-bold text-white text-[11px]">
          {displayInitials}
        </span>
      </button>
    </header>
  );
}
