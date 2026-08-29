import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { GuestVehicleReadyAlertPresentation } from './guest-vehicle-ready-alert';

describe('Guest vehicle-ready alert presentation', () => {
  it.each([
    {
      body: 'Your vehicle has arrived at the pickup area.',
      direction: 'ltr' as const,
      title: 'Your vehicle is ready',
    },
    {
      body: 'وصلت مركبتك إلى منطقة الاستلام وهي جاهزة لك.',
      direction: 'rtl' as const,
      title: 'سيارتك جاهزة',
    },
  ])('renders accessible $direction copy without session internals', (copy) => {
    const markup = renderToStaticMarkup(
      <GuestVehicleReadyAlertPresentation
        {...copy}
        dismissLabel="Close"
        onDismiss={() => undefined}
      />,
    );
    expect(markup).toContain(`dir="${copy.direction}"`);
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain(copy.title);
    expect(markup).toContain(copy.body);
    expect(markup).not.toContain('valetSessionId');
    expect(markup).not.toContain('readyAt');
  });

  it('dismisses only through the supplied local presentation callback', () => {
    const onDismiss = vi.fn();
    const element = GuestVehicleReadyAlertPresentation({
      body: 'Body',
      direction: 'ltr',
      dismissLabel: 'Close',
      onDismiss,
      title: 'Title',
    });
    const content = element.props.children as React.ReactElement<{
      children: React.ReactElement[];
    }>;
    const children = content.props.children;
    const dismissButton = children[1] as React.ReactElement<{
      onClick: () => void;
    }>;
    dismissButton.props.onClick();
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
