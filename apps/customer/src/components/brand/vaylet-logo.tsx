import React from 'react';

export function VayletLogo({
  dark = false,
  height = 24,
}: {
  readonly dark?: boolean;
  readonly height?: number;
}) {
  const src = dark
    ? '/brand/VAYLET_Logo_Dark_Background.png'
    : '/brand/VAYLET_Logo_Light_Background.png';

  return (
    <img
      src={src}
      alt="VAYLET"
      style={{ height, width: 'auto', display: 'block' }}
      className="object-contain"
    />
  );
}
