import React, { useState } from 'react';

import { Btn } from '../../components/primitives/btn';
import { InfoRow } from '../../components/primitives/info-row';
import { SectionTitle } from '../../components/primitives/typography-primitives';
import { C } from '../../lib/theme/colors';

export function ScreenRate({
  onDone,
}: {
  readonly onDone: () => void;
}) {
  const [stars, setStars] = useState(5);

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
      <div style={{ backgroundColor: '#FEF3C7', padding: '8px 12px', borderRadius: 8 }}>
        <span style={{ fontSize: 12, color: '#92400E', fontWeight: 500 }}>
          Preview Only · Guest feedback collection is deferred to customer portal phase.
        </span>
      </div>

      <SectionTitle>Rate Your Experience (Preview)</SectionTitle>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setStars(star)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 32,
              cursor: 'pointer',
              color: star <= stars ? '#F59E0B' : C.border,
            }}
          >
            ★
          </button>
        ))}
      </div>

      <Btn variant="primary" onClick={onDone}>
        Done
      </Btn>
    </div>
  );
}

export function ScreenHelp({
  onPaymentHelp,
}: {
  readonly onPaymentHelp?: () => void;
}) {
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

      <div
        style={{
          borderRadius: 14,
          padding: 20,
          backgroundColor: C.ice,
        }}
      >
        <InfoRow label="Valet Desk" value="Speak to staff on site" />
        <InfoRow label="Emergency" value="Contact hotel reception" />
      </div>

      {onPaymentHelp && (
        <Btn variant="secondary" onClick={onPaymentHelp}>
          Payment Information (Preview)
        </Btn>
      )}
    </div>
  );
}
