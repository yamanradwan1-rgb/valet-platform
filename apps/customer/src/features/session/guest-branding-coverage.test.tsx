import React from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Btn } from '../../components/primitives/btn';
import { JourneyProgress } from '../../components/primitives/journey-progress';
import { StatusBadge } from '../../components/primitives/status-badge';
import { TrustStrip } from '../../components/primitives/trust-strip';
import { LocaleProvider } from '../../i18n/locale-provider';
import { DemoScreenRenderer } from '../demo/demo-screen-renderer';
import { DEMO_GROUPS } from '../demo/demo-registry';
import { OverlayConfirmRequest } from '../retrieval/overlay-confirm-request';

const noop = () => {};
const render = (element: React.ReactNode) => renderToStaticMarkup(
  <LocaleProvider initialLocale="en">{element}</LocaleProvider>,
);

describe('actual Guest primary consumers and semantic exceptions', () => {
  it('uses exact primary fill/content and shared interaction classes on every primary CTA', () => {
    const primary = render(<Btn>Request</Btn>);
    expect(primary).toContain('class="guest-brand-primary"');
    expect(primary).toContain('background-color:var(--brand-button-fill, var(--brand-primary, var(--v-blue)))');
    expect(primary).toContain('color:var(--brand-on-primary, #FFFFFF)');
    expect(render(<Btn variant="ghost">Details</Btn>)).toContain('class="guest-brand-link"');
    expect(render(<Btn disabled>Disabled</Btn>)).toContain('disabled=""');
    expect(render(<Btn loading>Loading</Btn>)).toContain('border:2px solid currentColor');
    expect(render(<Btn variant="danger">Cancel</Btn>)).toContain('color:var(--v-danger)');
    expect(render(<Btn variant="secondary">Back</Btn>)).not.toContain('guest-brand-');
  });

  it('connects lifecycle progress, info badges, all existing demo CTA consumers and confirmation sheet', () => {
    expect(render(<JourneyProgress step={1} />)).toContain('background-color:var(--v-blue)');
    for (const status of ['info', 'active'] as const) {
      expect(render(<StatusBadge status={status} label={status} />)).toContain('color:var(--v-blue)');
    }
    for (const item of DEMO_GROUPS.flatMap((group) => group.items)) {
      if (item.kind !== 'screen') continue;
      const markup = render(<DemoScreenRenderer demoScreen={item.id} onSelectScreen={noop}
        onRequestClick={noop} onViewDetails={noop} />);
      expect(markup).not.toMatch(/(?:color|fill|stroke):(?:#176BFF|#2575FC|#0F5EEA)/iu);
      if (markup.includes('var(--brand-button-fill')) expect(markup).toContain('guest-brand-primary');
    }
    const sheet = render(<OverlayConfirmRequest open onClose={noop} onConfirm={noop} />);
    expect(sheet).toContain('background-color:var(--brand-surface, var(--v-ice))');
    expect(sheet).toContain('guest-brand-primary');
  });

  it('preserves semantic success/warning, trust colors and QR contrast', () => {
    expect(render(<TrustStrip />)).toContain('color:var(--v-trust-accent)');
    expect(render(<TrustStrip />)).toContain('background-color:var(--v-ice)');
    for (const [status, token] of [['success', '--v-success'], ['warning', '--v-warning']] as const) {
      const markup = render(<StatusBadge status={status} label={status} />);
      expect(markup).toContain(`color:var(${token})`);
      expect(markup).not.toContain('--brand-');
    }
    const qr = render(<DemoScreenRenderer demoScreen="demo-ready-qr" onSelectScreen={noop}
      onRequestClick={noop} onViewDetails={noop} />);
    expect(qr).toContain('fill="#FFFFFF"');
    expect(qr).toContain('background-color:var(--v-ice)');
  });

  it('keeps raw fixed VAYLET accents out of active Customer components', () => {
    const root = new URL('../../', import.meta.url);
    function audit(directory: string) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) { audit(path); continue; }
        if (!path.endsWith('.tsx') || path.includes('.test.') || path.includes('/demo/')) continue;
        expect(readFileSync(path, 'utf8'), path).not.toMatch(/#(?:176BFF|2575FC|0F5EEA)|C\.(?:brandBlue|brandBlueHover|blueh?)(?!\w)/iu);
      }
    }
    audit(root.pathname);
  });
});
