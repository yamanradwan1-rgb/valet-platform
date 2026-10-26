// Inputs to this module have already passed the canonical #RRGGBB contract.
export function brandLuminance(color: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

export function brandContrast(left: string, right: string): number {
  const a = brandLuminance(left);
  const b = brandLuminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function mix(color: string, target: string, amount: number): string {
  return '#' + [1, 3, 5].map((offset) => {
    const from = Number.parseInt(color.slice(offset, offset + 2), 16);
    const to = Number.parseInt(target.slice(offset, offset + 2), 16);
    return Math.round(from + (to - from) * amount).toString(16).padStart(2, '0');
  }).join('').toUpperCase();
}

export function guestBrandPalette(primary: string, dark: boolean) {
  const tint = mix(primary, dark ? '#07111F' : '#FFFFFF', dark ? 0.92 : 0.94);
  const surfaces = dark
    ? ['#07111F', '#0D1C2E', '#132742', '#182E4B', '#0E223D', tint]
    : ['#FAFAF8', '#FFFFFF', '#F1F4F9', '#EDF4FF', tint];
  const target = dark ? '#FFFFFF' : '#000000';
  let accent = primary;
  // Keep hue when possible; deterministically reach readable contrast on every
  // existing surface, including the brand tint. Primary fills stay exact.
  for (let percent = 1; surfaces.some((surface) => brandContrast(accent, surface) < 4.5); percent++) {
    accent = mix(primary, target, percent / 100);
  }
  const foreground = brandContrast(primary, '#FFFFFF') >= 4.5 ? '#FFFFFF'
    : brandContrast(primary, '#07111F') >= 4.5 ? '#07111F' : '#000000';
  const interaction = (amount: number) => {
    const toward = mix(primary, foreground, amount);
    return brandContrast(toward, foreground) >= 4.5 ? toward
      : mix(primary, foreground === '#FFFFFF' ? '#000000' : '#FFFFFF', amount);
  };
  return { primary, foreground, accent, tint, hover: interaction(0.1), pressed: interaction(0.2) };
}
