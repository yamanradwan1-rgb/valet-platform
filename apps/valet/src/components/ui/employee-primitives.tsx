import { useEffect, useState, type JSX } from "react";

import type { BadgeVariant } from "../../types/employee-ui";
import { BigCheckIcon, ChevronLeft } from "../icons/employee-icons";

export function Btn({
  label,
  onClick,
  variant = "primary",
  size = "lg",
  disabled,
}: {
  label: string;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "lg" | "md" | "sm";
  disabled?: boolean;
}): JSX.Element {
  const heights = {
    lg: "h-14 text-[15px]",
    md: "h-11 text-sm",
    sm: "h-9 text-sm",
  };
  const variants = {
    primary: "bg-vblue text-white active:bg-[#0F5EEA]",
    secondary: "bg-white border border-vborder text-navy active:bg-gray-50",
    ghost: "bg-transparent text-vblue active:bg-ice",
    danger: "bg-vdanger text-white active:opacity-90",
    success: "bg-vsuccess text-white active:opacity-90",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full font-semibold rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer select-none disabled:opacity-40 ${heights[size]} ${variants[variant]}`}
    >
      {label}
    </button>
  );
}

export function Badge({ variant }: { variant: BadgeVariant }): JSX.Element {
  const map: Record<
    BadgeVariant,
    { label: string; bg: string; text: string; dot: string }
  > = {
    checkin: {
      label: "CHECK-IN",
      bg: "bg-ice",
      text: "text-vblue",
      dot: "bg-vblue",
    },
    parking: {
      label: "PARKING",
      bg: "bg-[#FFF4E0]",
      text: "text-vwarning",
      dot: "bg-vwarning",
    },
    retrieval: {
      label: "RETRIEVAL",
      bg: "bg-ice",
      text: "text-vblue",
      dot: "bg-vblue",
    },
    handoff: {
      label: "HANDOFF",
      bg: "bg-[#F0FFF8]",
      text: "text-vsuccess",
      dot: "bg-vsuccess",
    },
    incident: {
      label: "INCIDENT",
      bg: "bg-[#FFF0F0]",
      text: "text-vdanger",
      dot: "bg-vdanger",
    },
    queued: {
      label: "QUEUED",
      bg: "bg-[#F5F6F8]",
      text: "text-neutral",
      dot: "bg-neutral",
    },
    active: {
      label: "ACTIVE",
      bg: "bg-ice",
      text: "text-vblue",
      dot: "bg-vblue",
    },
    parked: {
      label: "PARKED",
      bg: "bg-[#EEFBF5]",
      text: "text-vsuccess",
      dot: "bg-vsuccess",
    },
    requested: {
      label: "REQUESTED",
      bg: "bg-[#FFF4E0]",
      text: "text-vwarning",
      dot: "bg-vwarning",
    },
    ready: {
      label: "READY",
      bg: "bg-[#EEFBF5]",
      text: "text-vsuccess",
      dot: "bg-vsuccess",
    },
    completed: {
      label: "COMPLETED",
      bg: "bg-[#F5F6F8]",
      text: "text-neutral",
      dot: "bg-neutral",
    },
  };
  const { label, bg, text, dot } = map[variant];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider ${bg} ${text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      {label}
    </span>
  );
}

export function VehicleIdentity({
  model = "BMW X5",
  plate = "12-34567",
  color,
}: {
  model?: string | undefined;
  plate?: string | undefined;
  color?: string | undefined;
}): JSX.Element {
  return (
    <div>
      <p className="font-heading font-bold text-[26px] leading-tight text-navy">
        {model}
      </p>
      <p className="text-neutral text-sm mt-0.5">
        {plate}
        {color ? ` · ${color}` : ""}
      </p>
    </div>
  );
}

export function InfoRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between py-3 border-b border-vborder last:border-0">
      <span className="text-neutral text-sm">{label}</span>
      <span
        className={`font-semibold text-sm ${accent ? "text-vsuccess" : "text-navy"}`}
      >
        {value}
      </span>
    </div>
  );
}

export function BackHeader({
  title,
  onBack,
}: {
  title: string;
  onBack?: () => void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 px-5 h-14 bg-warm border-b border-vborder flex-shrink-0">
      <button
        onClick={onBack}
        className="p-1.5 -ml-1.5 cursor-pointer rounded-xl active:bg-vborder"
      >
        <ChevronLeft />
      </button>
      <h1 className="font-semibold text-navy text-[17px]">{title}</h1>
    </div>
  );
}

export function SuccessCircle({ size = 80 }: { size?: number }): JSX.Element {
  return (
    <div
      className="bg-vsuccess rounded-full flex items-center justify-center mx-auto"
      style={{ width: size, height: size }}
    >
      <BigCheckIcon />
    </div>
  );
}

export function ScannerFrame({
  label,
  sublabel,
  scanned,
}: {
  label: string;
  sublabel?: string;
  scanned?: boolean;
}): JSX.Element {
  return (
    <div className="relative h-[280px] bg-navy-2 flex flex-col items-center justify-center flex-shrink-0">
      <div className="relative w-[240px] h-[160px]">
        <span className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white rounded-tl-xl" />
        <span className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white rounded-tr-xl" />
        <span className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white rounded-bl-xl" />
        <span className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white rounded-br-xl" />
        {scanned ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 bg-vsuccess rounded-full flex items-center justify-center">
              <BigCheckIcon />
            </div>
          </div>
        ) : (
          <div className="absolute inset-x-2 top-[calc(50%-1px)] h-0.5 bg-vblue/60" />
        )}
      </div>
      <p className="text-white font-semibold mt-5 text-sm">{label}</p>
      {sublabel && <p className="text-muted text-xs mt-1">{sublabel}</p>}
    </div>
  );
}

export function ElapsedTimer({
  offsetSeconds = 0,
}: {
  offsetSeconds?: number;
}): JSX.Element {
  const [elapsed, setElapsed] = useState(offsetSeconds);
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const m = Math.floor(elapsed / 60)
    .toString()
    .padStart(2, "0");
  const s = (elapsed % 60).toString().padStart(2, "0");
  return (
    <span className="font-heading tabular-nums text-3xl font-bold text-navy">
      {m}:{s}
    </span>
  );
}

export function TrackingPill(): JSX.Element {
  return (
    <div className="inline-flex items-center gap-1.5 bg-vblue/10 px-3 py-1.5 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-vblue animate-pulse flex-shrink-0" />
      <span className="text-vblue text-[11px] font-semibold">
        Location active for this task
      </span>
    </div>
  );
}

export function OfflineBanner(): JSX.Element {
  return (
    <div className="bg-[#FFF4E0] border-b border-vwarning/20 px-5 py-2.5 flex items-center gap-2 flex-shrink-0">
      <span className="w-2 h-2 rounded-full bg-vwarning flex-shrink-0" />
      <span className="text-vwarning font-semibold text-xs">
        {"You're offline — Actions will sync when connection returns"}
      </span>
    </div>
  );
}
