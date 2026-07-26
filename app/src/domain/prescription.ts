// 처방 어휘 — 세트 타입(웜업/탑/백오프)·목표 RIR·반복범위·중량대 힌트 (순수 로직·테스트 대상). @plm SRS-043
// 처방의 작성 주체는 사람(트레이너·프리셋 루틴)이다 — 이 모듈은 저장 포맷과 "제안형 편의"(중량
// 이어달리기·타입별 권장 휴식)만 제공하며 처방을 자동으로 변경하는 함수를 두지 않는다(ADR-028).
// 모든 제안은 reasonKey(i18n)와 함께 표시되어 사용자가 근거를 보고 무시할 수 있다(SRS-015 웰니스).

export type PrescribedSetType = 'warmup' | 'top' | 'backoff' | 'normal';
export type LoadHint = 'light' | 'medium' | 'heavy';

export interface PrescribedSet {
  setType: PrescribedSetType;
  targetRir: number | null; // 0~6, null=미지정
  repMin: number | null;
  repMax: number | null;
  loadHint: LoadHint | null;
}

export const RIR_MIN = 0;
export const RIR_MAX = 6;

const SET_TYPES: PrescribedSetType[] = ['warmup', 'top', 'backoff', 'normal'];
const LOAD_HINTS: LoadHint[] = ['light', 'medium', 'heavy'];

// 방어적 파서 — DB @json 원시값(불량 JSON·타 타입 포함)을 안전한 PrescribedSet[]로. 빈 배열→null.
export function sanitizePrescriptionValue(raw: unknown): PrescribedSet[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PrescribedSet[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const o = item as Record<string, unknown>;
    const setType = SET_TYPES.includes(o.setType as PrescribedSetType) ? (o.setType as PrescribedSetType) : 'normal';
    const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
    const rir = num(o.targetRir);
    out.push({
      setType,
      targetRir: rir == null ? null : Math.min(RIR_MAX, Math.max(RIR_MIN, Math.round(rir))),
      repMin: num(o.repMin),
      repMax: num(o.repMax),
      loadHint: LOAD_HINTS.includes(o.loadHint as LoadHint) ? (o.loadHint as LoadHint) : null,
    });
  }
  return out.length > 0 ? out : null;
}

// 중량 이어달리기(캐스케이드) 상수 — 직전 세트 실측 → 다음 세트 제안 배율. 근거를 상수로 명시.
// 웜업 래더 +12%(RapidOverload 실측 20→22.4 관찰), 웜업→탑 +35%, 탑 유지, 백오프 −15%.
const CASCADE_RATIO: Record<string, { ratio: number; reasonKey: string }> = {
  'warmup>warmup': { ratio: 1.12, reasonKey: 'prescription.reason.warmupLadder' },
  'warmup>top': { ratio: 1.35, reasonKey: 'prescription.reason.topFromWarmup' },
  'top>top': { ratio: 1.0, reasonKey: 'prescription.reason.holdTop' },
  'top>backoff': { ratio: 0.85, reasonKey: 'prescription.reason.backoffFromTop' },
  'backoff>backoff': { ratio: 1.0, reasonKey: 'prescription.reason.holdBackoff' },
};

export interface CascadeSuggestion {
  weightKg: number;
  reasonKey: string; // i18n 키 — 제안 근거를 투명하게 설명(무시 가능)
}

// 직전 완료 세트의 실측 무게로 다음 처방 세트의 제안 무게를 계산한다. 규칙 밖 조합·불량 입력은 null.
export function suggestNextSetWeightKg(input: {
  prevWeightKg: number;
  prevType: PrescribedSetType | null;
  nextType: PrescribedSetType | null;
}): CascadeSuggestion | null {
  const { prevWeightKg, prevType, nextType } = input;
  if (!Number.isFinite(prevWeightKg) || prevWeightKg <= 0) return null;
  if (!prevType || !nextType) return null;
  const rule = CASCADE_RATIO[`${prevType}>${nextType}`];
  if (!rule) return null;
  const w = Math.round(prevWeightKg * rule.ratio * 10) / 10; // 0.1kg 반올림(소수점 제안 — UI가 근접 실중량 안내)
  if (w <= 0) return null;
  return { weightKg: w, reasonKey: rule.reasonKey };
}

// 세트 타입별 권장 휴식(초) — 비처방(normal·null)은 종목 설정값 그대로.
const REST_BY_TYPE: Record<Exclude<PrescribedSetType, 'normal'>, number> = {
  warmup: 45,
  top: 180,
  backoff: 120,
};

export function restSecondsForSetType(setType: PrescribedSetType | null | undefined, fallback: number): number {
  if (!setType || setType === 'normal') return fallback;
  return REST_BY_TYPE[setType] ?? fallback;
}

// 반복범위 라벨 — '4-7' / 단일 '8' / 없음 ''.
export function repRangeLabel(repMin: number | null, repMax: number | null): string {
  if (repMin != null && repMax != null) return repMin === repMax ? String(repMin) : `${repMin}-${repMax}`;
  if (repMin != null) return `${repMin}+`;
  if (repMax != null) return `~${repMax}`;
  return '';
}
