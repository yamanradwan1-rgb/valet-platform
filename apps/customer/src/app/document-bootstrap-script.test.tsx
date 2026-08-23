import React, { Children, isValidElement, type ReactElement } from 'react';
import Script from 'next/script';
import { describe, expect, it, vi } from 'vitest';

import RootLayout from './layout';
import { documentBootstrapScript } from './document-bootstrap-script';

interface MockElement {
  readonly attributes: Record<string, string>;
  readonly classList?: { add: ReturnType<typeof vi.fn> };
  lang?: string;
  dir?: string;
  readonly setAttribute: (name: string, value: string) => void;
}

function createElement(attributes: Record<string, string> = {}): MockElement {
  return {
    attributes,
    classList: { add: vi.fn() },
    setAttribute(name, value) {
      attributes[name] = value;
    },
  };
}

function runBootstrap(locale: string | null, theme: string | null) {
  const root = createElement();
  const meta = createElement({ content: '#FAFAF8' });
  const storage = new Map([
    ['vaylet_guest_locale', locale],
    ['vaylet_guest_theme', theme],
  ]);
  const localStorage = { getItem: (key: string) => storage.get(key) ?? null };
  const document = {
    documentElement: root,
    getElementById: (id: string) => (id === 'vaylet-theme-color' ? meta : null),
    querySelector: () => meta,
  };

  Function('localStorage', 'document', documentBootstrapScript)(localStorage, document);
  return { root, meta };
}

describe('Root document bootstrap', () => {
  it('preserves Arabic RTL and dark theme before hydration', () => {
    const { root, meta } = runBootstrap('ar', 'dark');

    expect(root).toMatchObject({ lang: 'ar', dir: 'rtl' });
    expect(root.attributes['data-theme']).toBe('dark');
    expect(root.classList?.add).toHaveBeenCalledWith('vaylet-persisted-ar');
    expect(meta.attributes.content).toBe('#07111F');
  });

  it('preserves English LTR and light theme defaults', () => {
    const { root, meta } = runBootstrap('unsupported', 'unsupported');

    expect(root).toMatchObject({ lang: 'en', dir: 'ltr' });
    expect(root.attributes['data-theme']).toBe('light');
    expect(meta.attributes.content).toBe('#FAFAF8');
  });

  it('uses the Next pre-hydration script mechanism in the root layout', () => {
    const layout = RootLayout({ children: <main /> }) as ReactElement<{
      children: React.ReactNode;
    }>;
    const head = Children.toArray(layout.props.children).find(
      (child) => isValidElement(child) && child.type === 'head',
    ) as ReactElement<{ children: React.ReactNode }>;
    const bootstrap = Children.toArray(head.props.children).find(
      (child) => isValidElement(child) && child.type === Script,
    ) as ReactElement<{ id: string; strategy: string }>;

    expect(bootstrap.props).toMatchObject({
      id: 'vaylet-document-bootstrap',
      strategy: 'beforeInteractive',
    });
  });
});
