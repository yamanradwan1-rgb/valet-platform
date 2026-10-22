import type { TranslationKey } from '../../i18n/translations/types';

export type DemoRenderableScreenKey =
  // Core / Vehicle
  | 'demo-received'
  | 'demo-parked'
  | 'demo-requested'
  | 'demo-on-the-way'
  | 'demo-ready'
  | 'demo-ready-pin'
  | 'demo-ready-qr'
  | 'demo-verifying'
  | 'demo-completed'
  // Payment
  | 'demo-payment-overview'
  | 'demo-payment-complimentary'
  | 'demo-add-tip'
  | 'demo-payment-method'
  | 'demo-payment-success'
  | 'demo-receipt'
  // Service
  | 'demo-rate-experience'
  | 'demo-report-issue'
  | 'demo-issue-submitted'
  // Errors
  | 'demo-network-unavailable'
  | 'demo-payment-error'
  | 'demo-request-error'
  | 'demo-expired';

export type DemoScreenKey = DemoRenderableScreenKey;
export type DemoNavigationKey = 'live' | DemoRenderableScreenKey;

export type DemoOverlayKey =
  | 'overlay-confirm-request'
  | 'overlay-vehicle-details'
  | 'overlay-more-menu';

export type DemoItem =
  | { kind: 'live'; id: 'live'; labelKey: TranslationKey }
  | { kind: 'screen'; id: DemoRenderableScreenKey; labelKey: TranslationKey }
  | { kind: 'overlay'; id: DemoOverlayKey; labelKey: TranslationKey };

export interface DemoGroup {
  id: 'core' | 'payment' | 'service' | 'errors' | 'overlays';
  titleKey: TranslationKey;
  items: DemoItem[];
}

export const DEMO_GROUPS: readonly DemoGroup[] = [
  {
    id: 'core',
    titleKey: 'demo.groupCore',
    items: [
      { kind: 'live', id: 'live', labelKey: 'demo.live' },
      { kind: 'screen', id: 'demo-received', labelKey: 'demo.received' },
      { kind: 'screen', id: 'demo-parked', labelKey: 'demo.parked' },
      { kind: 'screen', id: 'demo-requested', labelKey: 'demo.requested' },
      { kind: 'screen', id: 'demo-on-the-way', labelKey: 'demo.onTheWay' },
      { kind: 'screen', id: 'demo-ready', labelKey: 'demo.ready' },
      { kind: 'screen', id: 'demo-ready-pin', labelKey: 'demo.readyPin' },
      { kind: 'screen', id: 'demo-ready-qr', labelKey: 'demo.readyQr' },
      { kind: 'screen', id: 'demo-verifying', labelKey: 'demo.verifying' },
      { kind: 'screen', id: 'demo-completed', labelKey: 'demo.completed' },
    ],
  },
  {
    id: 'payment',
    titleKey: 'demo.groupPayment',
    items: [
      { kind: 'screen', id: 'demo-payment-overview', labelKey: 'demo.paymentOverview' },
      { kind: 'screen', id: 'demo-payment-complimentary', labelKey: 'demo.paymentComplimentary' },
      { kind: 'screen', id: 'demo-add-tip', labelKey: 'demo.addTip' },
      { kind: 'screen', id: 'demo-payment-method', labelKey: 'demo.paymentMethod' },
      { kind: 'screen', id: 'demo-payment-success', labelKey: 'demo.paymentSuccess' },
      { kind: 'screen', id: 'demo-receipt', labelKey: 'demo.receipt' },
    ],
  },
  {
    id: 'service',
    titleKey: 'demo.groupService',
    items: [
      { kind: 'screen', id: 'demo-rate-experience', labelKey: 'demo.rateExperience' },
      { kind: 'screen', id: 'demo-report-issue', labelKey: 'demo.reportIssue' },
      { kind: 'screen', id: 'demo-issue-submitted', labelKey: 'demo.issueSubmitted' },
    ],
  },
  {
    id: 'errors',
    titleKey: 'demo.groupErrors',
    items: [
      { kind: 'screen', id: 'demo-network-unavailable', labelKey: 'demo.networkUnavailable' },
      { kind: 'screen', id: 'demo-payment-error', labelKey: 'demo.paymentError' },
      { kind: 'screen', id: 'demo-request-error', labelKey: 'demo.requestError' },
      { kind: 'screen', id: 'demo-expired', labelKey: 'demo.expired' },
    ],
  },
  {
    id: 'overlays',
    titleKey: 'demo.groupOverlays',
    items: [
      { kind: 'overlay', id: 'overlay-confirm-request', labelKey: 'demo.overlayConfirmRequest' },
      { kind: 'overlay', id: 'overlay-vehicle-details', labelKey: 'demo.overlayVehicleDetails' },
      { kind: 'overlay', id: 'overlay-more-menu', labelKey: 'demo.overlayMoreMenu' },
    ],
  },
];
