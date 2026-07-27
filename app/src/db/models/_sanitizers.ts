import { normalizeGearTags, sanitizePrescriptionValue, sanitizeWeeklySchedule, type GearTag, type PrescribedSet, type WeeklySchedule } from '../../domain';

// @json 컬럼 sanitizer — DB 원시값을 안전한 string[]로 정규화.
export function sanitizeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string');
}

// 내 장비함(JSON) sanitizer — 도메인 정규화를 그대로 재사용한다. @plm SRS-041
// 화이트리스트·중복 병합·상한·source 수렴이 한 곳(domain/gear)에서만 정의되도록 위임한다 —
// 여기서 따로 구현하면 카테고리 목록이 갈려 저장된 태그가 조용히 사라진다.
export function sanitizeGearTags(raw: unknown): GearTag[] {
  return normalizeGearTags(raw);
}

// 유산소 목표(JSON) sanitizer — {durationSec,distanceM,incline,level,speed} 숫자 필드만. null=미설정. @plm SRS-030
export interface CardioTargetJson {
  durationSec?: number | null;
  distanceM?: number | null;
  incline?: number | null;
  level?: number | null;
  speed?: number | null; // v15: 러닝머신 속도(km/h)
}
export function sanitizeCardioTarget(raw: unknown): CardioTargetJson | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  const out: CardioTargetJson = {
    durationSec: num(o.durationSec),
    distanceM: num(o.distanceM),
    incline: num(o.incline),
    level: num(o.level),
    speed: num(o.speed),
  };
  return out.durationSec || out.distanceM || out.incline || out.level || out.speed ? out : null;
}

// 처방(JSON) sanitizer — 도메인 정규화 위임(타입·RIR 클램프·불량 항목 제거). @plm SRS-043
export function sanitizePrescription(raw: unknown): PrescribedSet[] | null {
  return sanitizePrescriptionValue(raw);
}
export type { PrescribedSet };

// 주단위 스케줄(JSON) sanitizer — 도메인 정규화 위임(길이 7 보정·블록 검증). @plm SRS-044
export function sanitizeWeeklyScheduleJson(raw: unknown): WeeklySchedule | null {
  return sanitizeWeeklySchedule(raw);
}
export type { WeeklySchedule };

// v19: 수동 '운동했어요' 표시일(JSON number[] — dayNumber). 정수만·중복 제거·상한 방어. @plm SRS-011
export function sanitizeManualWorkoutDaysJson(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const out = [...new Set(raw.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0))];
  out.sort((a, b) => a - b);
  return out.slice(0, 3000); // ≈8년치 매일 표시 — 폭주 데이터 방어 상한
}
