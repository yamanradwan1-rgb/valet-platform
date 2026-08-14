import React from 'react';

import { Btn } from '../../components/primitives/btn';
import { JourneyProgress } from '../../components/primitives/journey-progress';
import { IcShieldCheck } from '../../components/icons/status-icons';
import { C } from '../../lib/theme/colors';

export function ArabicWrapper({ children }: { readonly children: React.ReactNode }) {
  return (
    <div dir="rtl" className="font-arabic" style={{ fontFamily: "'Tajawal', sans-serif" }}>
      {children}
    </div>
  );
}

export function ScreenArParked({
  onRequestVehicle,
  onViewDetails,
}: {
  readonly onRequestVehicle: () => void;
  readonly onViewDetails: () => void;
}) {
  return (
    <ArabicWrapper>
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
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: C.success,
              display: 'block',
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 500, color: C.success }}>
            سيارتك مركونة بأمان
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: C.muted }}>
              سيارتك
            </span>
            <div
              className="font-display"
              style={{
                marginTop: 4,
                fontSize: 32,
                fontWeight: 600,
                color: C.navy,
              }}
            >
              BMW X5
            </div>
          </div>
          <div
            style={{
              backgroundColor: C.ice,
              width: 56,
              height: 56,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 18, color: C.blue }}>X5</span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderRadius: 12,
            padding: '12px 16px',
            backgroundColor: C.ice,
          }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.navy }}>تسليم محمي</div>
            <div style={{ fontSize: 12, marginTop: 2, color: C.grey }}>التحقق الفردي من الاستلام</div>
          </div>
          <div style={{ color: C.blue, marginRight: 'auto', display: 'flex' }}>
            <IcShieldCheck />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Btn onClick={onRequestVehicle}>اطلب سيارتك</Btn>
          <Btn onClick={onViewDetails} variant="ghost">
            تفاصيل السيارة
          </Btn>
        </div>
      </div>
    </ArabicWrapper>
  );
}

export function ScreenArRequested() {
  return (
    <ArabicWrapper>
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
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span
            className="pulse-dot"
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: C.blue,
              display: 'block',
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 500, color: C.blue }}>
            تم طلب السيارة
          </span>
        </div>

        <div
          style={{
            borderRadius: 14,
            padding: 20,
            backgroundColor: C.ice,
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 500, color: C.navy, margin: 0 }}>
            تم استلام طلبك ويجري تجهيز السيارة.
          </p>
        </div>

        <div style={{ paddingTop: 8, paddingBottom: 8 }}>
          <JourneyProgress step={0} />
        </div>
      </div>
    </ArabicWrapper>
  );
}
