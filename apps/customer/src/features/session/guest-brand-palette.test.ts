import { describe, expect, it } from 'vitest';
import { guestBrandStyle } from './guest-branding';
import { brandContrast, guestBrandPalette } from './guest-brand-palette';
import type { GuestSafeSession } from '../../lib/api/guest-api-types';

const colors = ['#00FF00', '#8000FF', '#176BFF', '#000000', '#FFFFFF',
  '#FFFF00', '#FF0000', '#0000FF', '#808080', '#757575', '#AADDFF'];

describe.each([false, true])('Guest branding contrast, dark=%s', (dark) => {
  it.each(colors)('preserves exact primary %s and readable derived states', (primary) => {
    const palette = guestBrandPalette(primary, dark);
    expect(palette.primary).toBe(primary);
    for (const fill of [palette.primary, palette.hover, palette.pressed]) {
      expect(brandContrast(fill, palette.foreground)).toBeGreaterThanOrEqual(4.5);
    }
    expect(palette.hover).not.toBe(primary);
    expect(palette.pressed).not.toBe(primary);
    expect(palette.pressed).not.toBe(palette.hover);
    const surfaces = dark
      ? ['#07111F', '#0D1C2E', '#132742', '#182E4B', '#0E223D', palette.tint]
      : ['#FAFAF8', '#FFFFFF', '#F1F4F9', '#EDF4FF', palette.tint];
    for (const surface of surfaces) {
      expect(brandContrast(palette.accent, surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(guestBrandPalette(primary, dark)).toEqual(palette);
  });

  it('accepts only canonical scoped hex values and never sets status or neutral tokens', () => {
    const session = (primaryColor: unknown) => ({ branding: { primaryColor } }) as GuestSafeSession;
    for (const color of [null, undefined, '', '#0f0', '#00ff00', '#1234567',
      '#00FF00;--v-danger:green', 'url(https://example.com)', {}, 123]) {
      expect(guestBrandStyle(session(color), dark)).toEqual({});
    }
    expect(guestBrandStyle(null, dark)).toEqual({});
    for (const color of colors) {
      const style = guestBrandStyle(session(color), dark);
      expect(style).toHaveProperty('--brand-primary', color);
      expect(style).not.toHaveProperty('--v-success');
      expect(style).not.toHaveProperty('--v-warning');
      expect(style).not.toHaveProperty('--v-danger');
      expect(style).not.toHaveProperty('--v-ice');
      expect(style).not.toHaveProperty('--v-trust-accent');
      expect(style).not.toHaveProperty('--v-bg');
    }
  });
});
