// 디자인 토큰 (다크 테마). 모든 화면이 이 토큰만 사용 — 색·간격·타이포 일관성.
export const colors = {
  bg: '#0E1116',
  surface: '#171B22',
  surfaceAlt: '#1E242D',
  border: '#2A323D',
  text: '#F2F5F8',
  textMuted: '#9AA6B2',
  textFaint: '#5E6B78',
  primary: '#4C8DFF',
  primaryMuted: '#2A4A7F',
  onPrimary: '#FFFFFF',
  success: '#37C871',
  warning: '#FFB020',
  danger: '#FF5C5C',
  pr: '#FFD23F', // PR 골드
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
  pill: 999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 36,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '600',
  bold: '700',
} as const;

export type ThemeColor = keyof typeof colors;
