// Brand palette mirrored from the web app's tailwind.config.js (red + yellow)
export const colors = {
  primary: '#dc2626',
  primaryDark: '#b91c1c',
  primaryLight: '#fee2e2',
  accent: '#f59e0b',
  accentLight: '#fef3c7',
  background: '#f7f7f7',
  surface: '#ffffff',
  text: '#1a1a1a',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  border: '#e5e7eb',
  success: '#16a34a',
  danger: '#dc2626',
  overlay: 'rgba(0,0,0,0.45)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export const typography = {
  title: { fontSize: 24, fontWeight: '800' as const, color: colors.text },
  heading: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.text },
  caption: { fontSize: 13, fontWeight: '400' as const, color: colors.textSecondary },
  price: { fontSize: 15, fontWeight: '700' as const, color: colors.primary },
} as const;

export const formatPeso = (amount: number): string =>
  `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
