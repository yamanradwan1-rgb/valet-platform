import React, { useMemo } from 'react';
import QRCode from 'qrcode';

import { C } from '../../lib/theme/colors';

export function DynamicQRCode({
  payload,
  size = 180,
}: {
  readonly payload: string;
  readonly size?: number;
}) {
  const qrData = useMemo(() => {
    try {
      const qr = QRCode.create(payload, {
        errorCorrectionLevel: 'M',
      });
      const moduleCount = qr.modules.size;
      const matrix: boolean[][] = [];
      for (let row = 0; row < moduleCount; row++) {
        const rowData: boolean[] = [];
        for (let col = 0; col < moduleCount; col++) {
          rowData.push(Boolean(qr.modules.get(row, col)));
        }
        matrix.push(rowData);
      }
      return { moduleCount, matrix };
    } catch {
      return null;
    }
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
          color: C.danger,
          fontSize: 12,
          padding: 8,
          textAlign: 'center',
        }}
      >
        QR generation error
      </div>
    );
  }

  const { moduleCount, matrix } = qrData;
  const cellSize = size / moduleCount;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Secure Dynamic QR Code"
    >
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
              fill={C.navy}
            />
          ) : null,
        ),
      )}
    </svg>
  );
}
