import React from 'react';

export function VayletLogo({
  dark,
  height = 24,
}: {
  readonly dark?: boolean | undefined;
  readonly height?: number;
}) {
  // If explicitly forced dark via prop (e.g. specialized dark banner)
  if (dark === true) {
    return (
      <img
        src="/brand/VAYLET_Logo_Dark_Background.png"
        alt="VAYLET"
        style={{ height, width: 'auto', display: 'block' }}
        className="object-contain"
      />
    );
  }

  // If explicitly forced light via prop
  if (dark === false) {
    return (
      <img
        src="/brand/VAYLET_Logo_Light_Background.png"
        alt="VAYLET"
        style={{ height, width: 'auto', display: 'block' }}
        className="object-contain"
      />
    );
  }

  // Hydration-stable theme-reactive markup: renders both, CSS controls visibility
  return (
    <span style={{ display: 'inline-block', height, position: 'relative' }}>
      <img
        src="/brand/VAYLET_Logo_Light_Background.png"
        alt="VAYLET"
        style={{ height, width: 'auto' }}
        className="vaylet-logo-light object-contain"
      />
      <img
        src="/brand/VAYLET_Logo_Dark_Background.png"
        alt=""
        aria-hidden="true"
        style={{ height, width: 'auto' }}
        className="vaylet-logo-dark object-contain"
      />
    </span>
  );
}
