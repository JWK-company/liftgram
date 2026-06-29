// 웰니스 가드레일 — 의료 표현 금지 · 추정치 라벨 강제. @plm SRS-015, ADR-006
// "웰니스" 포지션 유지가 식약처 의료기기 규제 회피의 핵심(reference 분석). 모든 분석/카피는
// 사실 집계만 표시하고 단정·보장·의료적 효능을 표방하지 않는다.
// 표시 문구(추정 1RM·면책·안전고지)는 i18n 번들 `wellness.*`로 이관(ko/en) — t('wellness.…')로 사용.

// 개발/테스트용 카피 게이트: 의료 단정·보장 표현 검출(ADR-006 카피 게이트).
const FORBIDDEN_PATTERNS = ['진단', '치료', '완치', '질병 예방', '100% 보장', '확실히 낫', '효능'];

export function containsMedicalClaim(text: string): boolean {
  return FORBIDDEN_PATTERNS.some((p) => text.includes(p));
}
