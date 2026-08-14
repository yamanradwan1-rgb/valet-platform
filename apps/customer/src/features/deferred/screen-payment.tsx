import React, { useState } from 'react';

import { Divider, Label, SectionTitle } from '../../components/primitives/typography-primitives';
import { Btn } from '../../components/primitives/btn';
import { VayletLogo } from '../../components/brand/vaylet-logo';
import { C } from '../../lib/theme/colors';

export function PaymentRow({
  label,
  amount,
  sub = false,
  total = false,
  success = false,
}: {
  readonly label: string;
  readonly amount: string;
  readonly sub?: boolean | undefined;
  readonly total?: boolean | undefined;
  readonly success?: boolean | undefined;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 14,
        paddingBottom: 14,
        borderBottom: total ? 'none' : `1px solid ${C.border}`,
      }}
    >
      <span
        style={{
          fontSize: 14,
          fontWeight: total ? 600 : sub ? 400 : 500,
          color: sub ? C.success : total ? C.navy : C.grey,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: total ? 16 : 14,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          color: success ? C.success : sub ? C.success : C.navy,
        }}
      >
        {amount}
      </span>
    </div>
  );
}

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
      <SectionTitle>Payment</SectionTitle>
      <div
        style={{
          borderRadius: 14,
          overflow: 'hidden',
          border: `1px solid ${C.border}`,
        }}
      >
        <div style={{ padding: '16px 20px 4px 20px' }}>
          <Label>Service summary (Preview)</Label>
        </div>
        <div style={{ paddingLeft: 20, paddingRight: 20 }}>
          <PaymentRow label="Valet service" amount="JOD 10.00" />
          <PaymentRow label="Venue validation" amount="−JOD 5.00" sub />
          <PaymentRow label="Total" amount="JOD 5.00" total />
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Btn onClick={onAddTip}>Add a tip</Btn>
        <Btn onClick={onPay} variant="secondary">
          Pay JOD 5.00
        </Btn>
      </div>
    </div>
  );
}

export function ScreenAddTip({
  onContinue,
}: {
  readonly onContinue: (total: number) => void;
}) {
  const [tip, setTip] = useState<'none' | '10' | '15' | '20'>('none');
  const tipAmounts = [
    { id: 'none' as const, label: 'No tip' },
    { id: '10' as const, label: '10%' },
    { id: '15' as const, label: '15%' },
    { id: '20' as const, label: '20%' },
  ];

  const tipValue = tip === 'none' ? 0 : (5 * parseInt(tip, 10)) / 100;
  const total = 5 + tipValue;

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
      <SectionTitle>Add a tip</SectionTitle>
      <p style={{ fontSize: 14, color: C.grey, margin: 0 }}>
        Tips are optional and go directly to the valet team.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {tipAmounts.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTip(id)}
            style={{
              padding: '12px 0',
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 10,
              backgroundColor: tip === id ? C.blue : 'transparent',
              color: tip === id ? '#FFFFFF' : C.navy,
              border: `1px solid ${tip === id ? C.blue : C.border}`,
              cursor: 'pointer',
              minHeight: 48,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        style={{
          borderRadius: 12,
          overflow: 'hidden',
          border: `1px solid ${C.border}`,
        }}
      >
        <div style={{ paddingLeft: 20, paddingRight: 20 }}>
          <PaymentRow label="Service total" amount="JOD 5.00" />
          {tip !== 'none' && (
            <PaymentRow label={`Tip (${tip}%)`} amount={`JOD ${tipValue.toFixed(2)}`} />
          )}
          <PaymentRow label="Total" amount={`JOD ${total.toFixed(2)}`} total />
        </div>
      </div>

      <Btn onClick={() => onContinue(total)}>Continue</Btn>
    </div>
  );
}

export function ScreenReceipt({ onDone }: { readonly onDone: () => void }) {
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
      <div style={{ textAlign: 'center', paddingTop: 12, paddingBottom: 12 }}>
        <VayletLogo height={22} />
        <p style={{ fontSize: 12, marginTop: 8, marginBottom: 0, color: C.muted }}>
          Valet Service Receipt Preview
        </p>
      </div>

      <Divider />

      <div>
        <Label>Charges</Label>
        <div style={{ marginTop: 8 }}>
          <PaymentRow label="Valet service" amount="JOD 10.00" />
          <PaymentRow label="Venue validation" amount="−JOD 5.00" sub />
          <PaymentRow label="Total paid" amount="JOD 5.00" total />
        </div>
      </div>

      <Divider />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Btn onClick={onDone}>Done</Btn>
      </div>
    </div>
  );
}
