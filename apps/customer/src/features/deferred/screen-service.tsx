import React, { useState } from 'react';

import { SectionTitle } from '../../components/primitives/typography-primitives';
import { Btn } from '../../components/primitives/btn';
import { IcCheck } from '../../components/icons/status-icons';
import { IcChevronRight, IcStar } from '../../components/icons/action-icons';
import { C } from '../../lib/theme/colors';

export function StarRating({
  value,
  onChange,
}: {
  readonly value: number;
  readonly onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: n <= value ? C.warning : C.border,
            transition: 'transform 100ms ease',
          }}
        >
          <IcStar size={36} filled={n <= value} />
        </button>
      ))}
    </div>
  );
}

export function ScreenRate({ onDone }: { readonly onDone: () => void }) {
  const [stars, setStars] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div
        className="screen-enter"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingLeft: 32,
          paddingRight: 32,
          minHeight: '60vh',
          gap: 16,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            backgroundColor: `${C.success}18`,
            color: C.success,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IcCheck />
        </div>
        <SectionTitle>Thank you!</SectionTitle>
        <p style={{ fontSize: 14, color: C.grey, margin: 0 }}>
          Your feedback helps us improve.
        </p>
        <div style={{ paddingTop: 16, width: '100%' }}>
          <Btn onClick={onDone}>Done</Btn>
        </div>
      </div>
    );
  }

  return (
    <div
      className="screen-enter"
      style={{
        paddingLeft: 20,
        paddingRight: 20,
        paddingTop: 24,
        paddingBottom: 32,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      <SectionTitle>How was your experience?</SectionTitle>
      <StarRating value={stars} onChange={setStars} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Btn onClick={() => setSubmitted(true)} disabled={stars === 0}>
          Submit feedback
        </Btn>
        <Btn onClick={onDone} variant="ghost">
          Skip
        </Btn>
      </div>
    </div>
  );
}

export function ScreenHelp({
  onPaymentHelp,
}: {
  readonly onPaymentHelp?: (() => void) | undefined;
}) {
  const items = [
    { label: 'Need help with your vehicle?', sub: 'Contact valet desk', action: () => {} },
    { label: 'Payment question', sub: 'View payment details', action: onPaymentHelp },
  ];

  return (
    <div
      className="screen-enter"
      style={{
        paddingLeft: 20,
        paddingRight: 20,
        paddingTop: 24,
        paddingBottom: 32,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <SectionTitle>Help & Support</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(({ label, sub, action }) => (
          <button
            key={label}
            type="button"
            onClick={action}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 16,
              borderRadius: 12,
              border: `1px solid ${C.border}`,
              backgroundColor: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>{label}</div>
              <div style={{ fontSize: 12, color: C.grey }}>{sub}</div>
            </div>
            <div style={{ color: C.grey }}>
              <IcChevronRight />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
