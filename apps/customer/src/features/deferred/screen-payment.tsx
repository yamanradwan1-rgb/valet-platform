import React, { useState } from 'react';

import { Btn } from '../../components/primitives/btn';
import { InfoRow } from '../../components/primitives/info-row';
import { SectionTitle } from '../../components/primitives/typography-primitives';
import { C } from '../../lib/theme/colors';

export function ScreenPaymentOverview({
  onAddTip,
  onPay,
}: {
  readonly onAddTip: () => void;
  readonly onPay: () => void;
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
      <div style={{ backgroundColor: '#FEF3C7', padding: '8px 12px', borderRadius: 8 }}>
        <span style={{ fontSize: 12, color: '#92400E', fontWeight: 500 }}>
          Preview Only · Payment phase is not yet connected to production backend.
        </span>
      </div>

      <SectionTitle>Payment Preview</SectionTitle>

      <div
        style={{
          borderRadius: 14,
          padding: 20,
          backgroundColor: C.ice,
        }}
      >
        <InfoRow label="Valet Service" value="Complimentary" />
        <InfoRow label="Tip" value="Not added" />
        <div style={{ borderTop: `1px solid ${C.border}`, margin: '8px 0' }} />
        <InfoRow label="Estimated Total" value="0.00" highlight />
      </div>

      <Btn variant="secondary" onClick={onAddTip}>
        Preview Add Tip
      </Btn>

      <Btn variant="primary" onClick={onPay}>
        Preview Receipt
      </Btn>
    </div>
  );
}

export function ScreenAddTip({
  onContinue,
}: {
  readonly onContinue: () => void;
}) {
  const [selectedTip, setSelectedTip] = useState<number | null>(null);

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
          Preview Only · Tip configuration is deferred to payments phase.
        </span>
      </div>

      <SectionTitle>Add a Tip (Preview)</SectionTitle>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[1, 2, 5].map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => setSelectedTip(amount)}
            style={{
              padding: '16px 0',
              borderRadius: 12,
              border: `2px solid ${selectedTip === amount ? C.navy : C.border}`,
              backgroundColor: selectedTip === amount ? C.ice : '#FFFFFF',
              fontWeight: 600,
              fontSize: 16,
              color: C.navy,
              cursor: 'pointer',
            }}
          >
            +{amount}
          </button>
        ))}
      </div>

      <Btn variant="primary" onClick={onContinue}>
        Done
      </Btn>
    </div>
  );
}

export function ScreenReceipt({
  onDone,
}: {
  readonly onDone: () => void;
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
      <div style={{ backgroundColor: '#FEF3C7', padding: '8px 12px', borderRadius: 8 }}>
        <span style={{ fontSize: 12, color: '#92400E', fontWeight: 500 }}>
          Preview Only · Receipts will be generated from backend settlement records.
        </span>
      </div>

      <SectionTitle>Receipt Preview</SectionTitle>

      <div
        style={{
          borderRadius: 14,
          padding: 20,
          backgroundColor: C.ice,
        }}
      >
        <InfoRow label="Service" value="Standard Valet" />
        <InfoRow label="Status" value="Complimentary" />
        <div style={{ borderTop: `1px solid ${C.border}`, margin: '8px 0' }} />
        <InfoRow label="Total" value="0.00" highlight />
      </div>

      <Btn variant="primary" onClick={onDone}>
        Back
      </Btn>
    </div>
  );
}
