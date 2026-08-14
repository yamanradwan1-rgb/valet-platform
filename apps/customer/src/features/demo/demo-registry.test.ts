import { describe, expect, it } from 'vitest';

import { en } from '../../i18n/translations/en';
import { ar } from '../../i18n/translations/ar';
import {
  DEMO_GROUPS,
  type DemoGroup,
  type DemoItem,
} from './demo-registry';

describe('Demo Preview Registry & Contracts', () => {
  it('contains exactly 5 grouped categories', () => {
    expect(DEMO_GROUPS).toHaveLength(5);
    const groupIds = DEMO_GROUPS.map((g: DemoGroup) => g.id);
    expect(groupIds).toEqual(['core', 'payment', 'service', 'errors', 'overlays']);
  });

  it('has valid translation keys in both English and Arabic for all group titles', () => {
    DEMO_GROUPS.forEach((group: DemoGroup) => {
      expect(en[group.titleKey]).toBeDefined();
      expect(ar[group.titleKey]).toBeDefined();
      expect(en[group.titleKey].length).toBeGreaterThan(0);
      expect(ar[group.titleKey].length).toBeGreaterThan(0);
    });
  });

  it('has unique IDs across all items and valid label keys in both dictionaries', () => {
    const allIds = new Set<string>();

    DEMO_GROUPS.forEach((group: DemoGroup) => {
      group.items.forEach((item: DemoItem) => {
        expect(allIds.has(item.id)).toBe(false);
        allIds.add(item.id);

        expect(en[item.labelKey]).toBeDefined();
        expect(ar[item.labelKey]).toBeDefined();
        expect(en[item.labelKey].length).toBeGreaterThan(0);
        expect(ar[item.labelKey].length).toBeGreaterThan(0);
      });
    });
  });

  it('proves no legacy Arabic duplicate screen keys exist', () => {
    const allIds: string[] = [];
    DEMO_GROUPS.forEach((g: DemoGroup) => g.items.forEach((i: DemoItem) => allIds.push(i.id)));

    // Ensure obsolete ar-* screens from legacy mock are NOT recreated
    const legacyArKeys = [
      'ar-parked',
      'ar-requested',
      'ar-ready',
      'ar-payment',
      'ar-completed',
      'demo-ar-parked',
    ];
    legacyArKeys.forEach((key) => {
      expect(allIds).not.toContain(key);
    });
  });

  it('distinguishes screen items from overlay items strictly by kind', () => {
    const screenItems = DEMO_GROUPS.flatMap((g) => g.items).filter((i) => i.kind === 'screen');
    const overlayItems = DEMO_GROUPS.flatMap((g) => g.items).filter((i) => i.kind === 'overlay');

    expect(screenItems.length).toBeGreaterThan(15);
    expect(overlayItems).toHaveLength(3);

    const overlayIds = overlayItems.map((o) => o.id);
    expect(overlayIds).toEqual([
      'overlay-confirm-request',
      'overlay-vehicle-details',
      'overlay-more-menu',
    ]);
  });
});
