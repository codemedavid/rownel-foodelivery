// Brand palette mirrored from the web app's tailwind.config.js (red + yellow),
// extended with a neutral ramp, tints and elevation tokens so screens can be
// composed from tokens instead of ad-hoc hex values.
export const colors = {
  primary: '#e11d2e',
  primaryDark: '#b3121f',
  primaryLight: '#ffe8e9',
  primarySoft: '#fff4f4',
  accent: '#f59e0b',
  accentDark: '#b45309',
  accentLight: '#fef3c7',
  background: '#f6f6f8',
  backgroundAlt: '#eef0f4',
  surface: '#ffffff',
  surfaceAlt: '#fafafb',
  surfaceSunken: '#f2f3f6',
  text: '#14161a',
  textSecondary: '#5f6672',
  textMuted: '#9aa1ad',
  onPrimary: '#ffffff',
  border: '#e8eaee',
  borderStrong: '#d6d9e0',
  success: '#12915b',
  successLight: '#e3f7ed',
  warning: '#c2650b',
  warningLight: '#fdf0dd',
  info: '#1d4ed8',
  infoLight: '#e6edfe',
  danger: '#d92d20',
  dangerLight: '#fdeaea',
  overlay: 'rgba(0,0,0,0.45)',
  skeleton: '#e9ebef',
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

/** Cross-platform elevation presets — iOS shadow props plus Android elevation. */
export const shadows = {
  none: {},
  sm: {
    shadowColor: '#0b1220',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  md: {
    shadowColor: '#0b1220',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  lg: {
    shadowColor: '#0b1220',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
} as const;

export const typography = {
  display: { fontSize: 30, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.6 },
  title: { fontSize: 24, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.4 },
  heading: { fontSize: 18, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.2 },
  subheading: { fontSize: 15, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.text },
  caption: { fontSize: 13, fontWeight: '400' as const, color: colors.textSecondary },
  overline: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
  },
  price: { fontSize: 15, fontWeight: '800' as const, color: colors.text },
} as const;

export const formatPeso = (amount: number): string =>
  `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
