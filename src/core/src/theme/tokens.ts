// 디자인 토큰 (다크 테마). 모든 화면이 이 토큰만 사용 — 색·간격·타이포 일관성.
// ── 색 (2026-10-26 · 브랜드 확정: 로고 B1 · 주황 · 라이트 기본 + 다크) ─────────────────
// 구조는 booktarae(피그마 디자인 시스템 v2.0)와 같다 — 원시값 두 벌(라이트·다크)을 CSS 변수로 두고
// 화면은 의미 이름(--color-*)만 쓴다. 바탕·글자·경계·상태색은 booktarae 값 그대로, **대표색만 주황**.
//
// 주황의 분업(booktarae 의 "600=비텍스트 / 700=글자·채운 판"과 같은 판단):
//   brand      — 글자·아이콘·채운 버튼 판. 라이트 #C8381C(흰 글자 5.20:1 · 흰 바탕 5.20 · 회색 바탕 4.85)
//                다크 #FF7A57(바탕 7.04 · 카드 5.51 · 그 위 어두운 글자 7.04)
//   brandVivid — 로고 심볼·진도 막대 같은 **면·장식**(#FF5A36 · 흰 바탕 3.10 = 비텍스트 3:1 통과).
//                라이트 글자로 쓰면 3.1:1 이라 AA 미달 — 글자에는 brand 를 쓴다.
// 대비 값은 전부 계산값이다(WCAG 2.1 상대 휘도).
export const colors = {
  bg: '#F7F7F7', // color/background/canvas
  surface: '#FFFFFF', // color/background/surface
  surfaceAlt: '#F1F2F4', // 입력칸·칩 판(ink 16.0:1)
  border: '#DBDBDB', // 장식 구분선(카드 테두리) — 컨트롤 경계로 쓰지 않는다
  borderStrong: '#747474', // 입력·토글 경계(흰 바탕 4.67:1)
  text: '#141619', // 18.13:1
  textMuted: '#3E4348', // 9.99:1
  textFaint: '#6A737B', // 흰 바탕 4.83 · 회색 바탕 4.51
  primary: '#C8381C',
  primaryVivid: '#FF5A36',
  primaryMuted: '#FFF0EB', // 선택 판 — 그 위 brand 글자 4.68:1
  onPrimary: '#FFFFFF',
  success: '#047857',
  successSoft: '#EBF4F2',
  warning: '#B45309',
  warningSoft: '#F9F1EB',
  danger: '#B91C1C',
  dangerSoft: '#F9EDED',
  pr: '#A16207', // PR 골드 — 라이트에서는 글자로 읽히게 진하게(흰 바탕 4.92:1)
  prSoft: '#FEF3C7',
} as const;

export const darkColors: Record<keyof typeof colors, string> = {
  bg: '#161616', // 순검정 금지(OLED 잔상) — booktarae 와 같다
  surface: '#2B2B2B',
  surfaceAlt: '#3A3A3A', // ink 10.59 · ink3 4.35
  border: '#424242',
  borderStrong: '#A8A8A8', // 카드 대비 5.95:1
  text: '#F5F7F9',
  textMuted: '#D8DBDF',
  textFaint: '#98A1AD',
  primary: '#FF7A57',
  primaryVivid: '#FF5A36',
  primaryMuted: '#3D2620', // 그 위 brand 글자 5.46:1
  onPrimary: '#161616',
  success: '#6EE7B7',
  successSoft: '#34453F',
  warning: '#FBBF24',
  warningSoft: '#48402A',
  danger: '#FCA5A5',
  dangerSoft: '#483C3C',
  pr: '#FFD23F', // 카드 대비 9.81:1
  prSoft: '#4A3F12',
};

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
  xl: 24, // booktarae display-sm
  xxl: 28, // booktarae display-lg
} as const;

export const fontWeight = {
  regular: '400',
  medium: '600',
  bold: '700',
} as const;

export type ThemeColor = keyof typeof colors;
