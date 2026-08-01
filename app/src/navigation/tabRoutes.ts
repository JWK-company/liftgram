// 탭 화면 이름 집합 — 의존성 없는 리프 모듈(컴포넌트↔네비게이터 require 사이클 방지).
// 전역 운동 바가 '탭바 위'와 '화면 바닥' 중 어디에 앉을지 판단하는 데 쓴다(바는 네비게이터 밖
// 루트 오버레이라 탭바 컨텍스트를 못 읽는다 → 현재 라우트명으로 판별). @plm SRS-004
import type { TabParamList } from './types';

export const TAB_ROUTE_NAMES: readonly (keyof TabParamList)[] = [
  'WorkoutTab',
  'FeedTab',
  'HistoryTab',
  'CalendarTab',
  'StatsTab',
  'ProfileTab',
  'FeedbackTab',
];

export function isTabRoute(routeName: string | undefined): boolean {
  return !!routeName && (TAB_ROUTE_NAMES as readonly string[]).includes(routeName);
}
