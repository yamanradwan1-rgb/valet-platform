export const C = {
  navy: '#07111F',
  navy2: '#0B1626',
  navy3: '#111E30',
  blue: '#176BFF',
  blueh: '#0F5EEA',
  ice: '#EDF4FF',
  warm: '#FAFAF8',
  grey: '#6F7C91',
  muted: '#8C98AA',
  border: '#DDE4EC',
  success: '#2F9B78',
  warning: '#D89434',
  danger: '#D95C63',
} as const;

export type ColorKey = keyof typeof C;
