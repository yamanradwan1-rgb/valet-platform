import type { JSX } from "react";

export function AppHeader({
  onAvatarTap,
}: {
  onAvatarTap?: () => void;
}): JSX.Element {
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
            Four Seasons Amman
          </p>
          <p className="text-neutral text-[11px] leading-tight">
            Main Entrance
          </p>
        </div>
      </div>
      <button
        onClick={onAvatarTap}
        className="w-9 h-9 rounded-full bg-navy-3 flex items-center justify-center cursor-pointer active:opacity-70"
      >
        <span className="font-heading font-bold text-white text-[11px]">
          MK
        </span>
      </button>
    </header>
  );
}
