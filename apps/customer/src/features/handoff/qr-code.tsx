import React, { useMemo } from 'react';

import { useTranslation } from '../../i18n/use-translation';
import { C } from '../../lib/theme/colors';
import {
  computeQrMatrixWithQuietZone,
  QR_QUIET_ZONE_MODULES,
} from './qr-matrix';

export { QR_QUIET_ZONE_MODULES, computeQrMatrixWithQuietZone } from './qr-matrix';
export type { QrMatrixResult } from './qr-matrix';

export function DynamicQRCode({
  payload,
  size = 180,
}: {
  readonly payload: string;
  readonly size?: number;
}) {
  const { t } = useTranslation();
  const qrData = useMemo(() => {
    return computeQrMatrixWithQuietZone(payload, QR_QUIET_ZONE_MODULES);
  }, [payload]);

  if (!qrData) {
    return (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#FFFFFF',
          color: C.dangerSemantic,
          fontSize: 12,
          padding: 8,
          textAlign: 'center',
        }}
      >
        {t('handoffQr.generationError')}
      </div>
    );
  }

  const { totalGridSize, matrix } = qrData;
  const cellSize = size / totalGridSize;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={t('handoffQr.ariaLabel')}
    >
      {/* High-contrast static white scan surface and dark modules */}
      <rect width={size} height={size} fill="#FFFFFF" />
      {matrix.map((row, y) =>
        row.map((filled, x) =>
          filled ? (
            <rect
              key={`${x}-${y}`}
              x={x * cellSize}
              y={y * cellSize}
              width={cellSize}
              height={cellSize}
              fill={C.brandNavy}
            />
          ) : null,
        ),
      )}
    </svg>
  );
}
