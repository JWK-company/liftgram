// 웰니스 가드레일 — 의료 표현 금지 · 추정치 라벨 강제. @plm SRS-015, ADR-006
// "웰니스" 포지션 유지가 식약처 의료기기 규제 회피의 핵심(reference 분석). 모든 분석/카피는
// 사실 집계만 표시하고 단정·보장·의료적 효능을 표방하지 않는다.

export const WELLNESS = {
  oneRepMaxLabel: '추정 1RM',
  oneRepMaxCaption: 'Epley 공식 기반 추정치 · 실측값 아님',
  noMedicalClaimNotice: '본 앱은 운동 기록·웰니스 도구이며 질병의 진단·치료·예방을 목적으로 하지 않습니다.',
  safetyNotice: '무리한 중량·횟수는 부상 위험이 있습니다. 통증이 있으면 운동을 멈추고 전문가와 상담하세요.',
} as const;

// 개발/테스트용 카피 게이트: 의료 단정·보장 표현 검출(ADR-006 카피 게이트).
const FORBIDDEN_PATTERNS = ['진단', '치료', '완치', '질병 예방', '100% 보장', '확실히 낫', '효능'];

export function containsMedicalClaim(text: string): boolean {
  return FORBIDDEN_PATTERNS.some((p) => text.includes(p));
}
