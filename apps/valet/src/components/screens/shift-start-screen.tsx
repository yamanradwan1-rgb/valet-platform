import type { JSX } from "react";

import { KeyIcon, LocationPinIcon } from "../icons/employee-icons";

export function ShiftStartScreen({
  onStart,
}: {
  onStart: () => void;
}): JSX.Element {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-center px-6 pb-10"
      style={{
        background:
          "radial-gradient(ellipse at 55% 0%, #0B2D6E 0%, #07111F 65%)",
      }}
    >
      <img
        src="/brand/VAYLET_Logo_Dark_Background.png"
        alt="VAYLET"
        className="h-9 object-contain mb-14"
      />

      <div className="w-full bg-white/[0.06] border border-white/10 rounded-3xl p-6 mb-8 backdrop-blur-sm">
        <p className="text-muted text-sm mb-1">Welcome back</p>
        <p className="font-heading font-bold text-white text-2xl mb-6">
          Mohammed Khalil
        </p>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
              <LocationPinIcon />
            </div>
            <div>
              <p className="text-muted text-xs">Location</p>
              <p className="text-white font-semibold text-sm">
                Four Seasons Amman
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
              <KeyIcon />
            </div>
            <div>
              <p className="text-muted text-xs">Zone</p>
              <p className="text-white font-semibold text-sm">Main Entrance</p>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full space-y-3">
        <button
          onClick={onStart}
          className="w-full h-14 bg-vblue text-white font-bold text-base rounded-2xl flex items-center justify-center active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-vblue/30"
        >
          Start Shift
        </button>
        <button className="w-full h-11 text-muted text-sm font-semibold cursor-pointer hover:text-white transition-colors">
          Change Location
        </button>
      </div>
    </div>
  );
}
