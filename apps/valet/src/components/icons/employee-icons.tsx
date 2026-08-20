import type { JSX } from "react";

export function HomeIcon({ active }: { active?: boolean }): JSX.Element {
  const c = active ? "#176BFF" : "#6F7C91";
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path
        d="M3 9L11 3l8 6v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9z"
        stroke={c}
        strokeWidth="1.6"
        fill="none"
        strokeLinejoin="round"
      />
      <path
        d="M8 20V13h6v7"
        stroke={c}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CarIcon({ active }: { active?: boolean }): JSX.Element {
  const c = active ? "#176BFF" : "#6F7C91";
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path
        d="M4 10l2-4h10l2 4"
        stroke={c}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect
        x="2"
        y="10"
        width="18"
        height="7"
        rx="2"
        stroke={c}
        strokeWidth="1.6"
      />
      <circle cx="6" cy="17" r="1.5" fill={c} />
      <circle cx="16" cy="17" r="1.5" fill={c} />
    </svg>
  );
}

export function ScanIcon({
  active,
  white,
}: {
  active?: boolean;
  white?: boolean;
}): JSX.Element {
  const c = white ? "white" : active ? "#176BFF" : "#6F7C91";
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path
        d="M4 7V5a1 1 0 011-1h2M15 4h2a1 1 0 011 1v2M18 15v2a1 1 0 01-1 1h-2M7 18H5a1 1 0 01-1-1v-2"
        stroke={c}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M6 11h10" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ShiftIcon({ active }: { active?: boolean }): JSX.Element {
  const c = active ? "#176BFF" : "#6F7C91";
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="8" r="3.5" stroke={c} strokeWidth="1.6" />
      <path
        d="M4 19c0-3.866 3.134-7 7-7s7 3.134 7 7"
        stroke={c}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ChevronLeft(): JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M15 18l-6-6 6-6"
        stroke="#07111F"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronRight(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M6 4l4 4-4 4"
        stroke="#8C98AA"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PlusIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 2v10M2 7h10"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CheckSmIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M2 6l3 3 5-5"
        stroke="white"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BigCheckIcon(): JSX.Element {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <path
        d="M6 18l8 8L30 10"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LocationPinIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 7a2 2 0 100-4 2 2 0 000 4z" fill="white" />
      <path
        d="M7 1C4.24 1 2 3.24 2 6c0 3.75 5 7 5 7s5-3.25 5-7c0-2.76-2.24-5-5-5z"
        stroke="white"
        strokeWidth="1.25"
        fill="none"
      />
    </svg>
  );
}

export function KeyIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="5" cy="6" r="3.5" stroke="white" strokeWidth="1.25" />
      <path
        d="M8 6h4M11 6v2"
        stroke="white"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CameraSquareIcon(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <path
        d="M24 22H4a2 2 0 01-2-2V10a2 2 0 012-2h3.5l2-3h9l2 3H24a2 2 0 012 2v10a2 2 0 01-2 2z"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
      />
      <circle cx="14" cy="15" r="4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function AlertIcon(): JSX.Element {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path
        d="M16 10v9M16 23v.5"
        stroke="#D95C63"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M13.5 4.5l-11 19A3 3 0 005 28h22a3 3 0 002.5-4.5l-11-19a3 3 0 00-5 0z"
        stroke="#D95C63"
        strokeWidth="1.75"
        fill="none"
      />
    </svg>
  );
}

export function SearchIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="#8C98AA" strokeWidth="1.25" />
      <path
        d="M11.5 11.5L14 14"
        stroke="#8C98AA"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}
