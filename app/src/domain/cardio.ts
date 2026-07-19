// 유산소(cardio) 지표 포맷·파싱 — 저장은 초(sec)·미터(m) 정규, 입력·표시는 분(min)·킬로미터(km). @plm SRS-030
// 볼륨/PR 계층은 유산소를 제외하므로(무게·횟수 0), 이 모듈은 순수 표시/입력 변환만 담당한다.

// 저장 초 → 분 입력 문자열(정수면 정수, 아니면 소수1자리). 0/null = 빈칸.
export function secToMinInput(sec: number | null | undefined): string {
  if (sec == null || sec <= 0) return '';
  const min = sec / 60;
  return Number.isInteger(min) ? String(min) : min.toFixed(1);
}

// 분 입력 → 저장 초. 빈/0/음수/NaN = null(미기록).
export function minInputToSec(text: string): number | null {
  const n = parseFloat(text.replace(',', '.'));
  if (Number.isNaN(n) || n <= 0) return null;
  return Math.round(n * 60);
}

// 저장 미터 → km 입력 문자열(불필요한 0 제거). 0/null = 빈칸.
export function mToKmInput(m: number | null | undefined): string {
  if (m == null || m <= 0) return '';
  const km = m / 1000;
  if (Number.isInteger(km)) return String(km);
  return km.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

// km 입력 → 저장 미터. 빈/0/음수/NaN = null(미기록).
export function kmInputToM(text: string): number | null {
  const n = parseFloat(text.replace(',', '.'));
  if (Number.isNaN(n) || n <= 0) return null;
  return Math.round(n * 1000);
}

// 표시용 시계 포맷 — "MM:SS"(1시간 이상이면 "H:MM:SS").
export function formatDurationClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const mm = String(m).padStart(2, '0');
  const sss = String(ss).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${sss}` : `${mm}:${sss}`;
}

export function formatDistanceKm(m: number): string {
  // 입력칸(mToKmInput)과 동일하게 후행 0을 정리해 '5.2km'로 통일(5200m가 입력·표시에서 같게).
  const km = m / 1000;
  const s = Number.isInteger(km) ? String(km) : km.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${s}km`;
}

// 유산소 세트 한 줄 요약 — 시간·거리 조합("30:00 · 5.2km"). 둘 다 없으면 '–'.
export function formatCardioSet(durationSec?: number | null, distanceM?: number | null): string {
  const parts: string[] = [];
  if (durationSec != null && durationSec > 0) parts.push(formatDurationClock(durationSec));
  if (distanceM != null && distanceM > 0) parts.push(formatDistanceKm(distanceM));
  return parts.length ? parts.join(' · ') : '–';
}

// ── 종목별 유산소 지표(SRS-030 확장) ─────────────────────────────
// 기구마다 기록할 정보가 다르다: 러닝머신=경사, 실내 사이클·천국의 계단=단계 등.
// incline(경사 %)과 level(단계)은 상호배타(기구는 둘 중 하나). 미매핑(커스텀)은 기본 [시간·거리].
export type CardioMetric = 'duration' | 'distance' | 'incline' | 'level';

export interface CardioTarget {
  durationSec?: number | null;
  distanceM?: number | null;
  incline?: number | null; // 경사 %
  level?: number | null; // 저항/강도 단계
}

// nameEn 기준 종목별 지표. 새 종목 추가 시 여기에 등록.
const CARDIO_METRICS_BY_NAME_EN: Record<string, CardioMetric[]> = {
  'Treadmill Running': ['duration', 'distance', 'incline'],
  Running: ['duration', 'distance'],
  Walking: ['duration', 'distance', 'incline'],
  'Indoor Cycling': ['duration', 'distance', 'level'],
  Elliptical: ['duration', 'distance', 'level'],
  'Stair Climber': ['duration', 'level'], // 천국의 계단(스텝밀)
  'Jump Rope': ['duration'],
  'Rowing Machine': ['duration', 'distance', 'level'],
  'Assault Bike': ['duration', 'distance', 'level'],
  'Stepper': ['duration', 'level'],
  SkiErg: ['duration', 'distance', 'level'],
};

export function cardioMetricsFor(ex: { nameEn?: string | null }): CardioMetric[] {
  const m = ex.nameEn ? CARDIO_METRICS_BY_NAME_EN[ex.nameEn] : undefined;
  return m ?? ['duration', 'distance'];
}

// incline/level 등 단순 수치 입력 helpers — 저장은 number, 빈/0/음수/NaN = null.
export function cardioNumInput(v: number | null | undefined): string {
  if (v == null || v <= 0) return '';
  return String(v);
}
export function inputToIncline(text: string): number | null {
  const n = parseFloat(text.replace(',', '.'));
  return Number.isNaN(n) || n <= 0 ? null : Math.round(n * 10) / 10; // 소수1자리
}
export function inputToLevel(text: string): number | null {
  const n = parseInt(text, 10);
  return Number.isNaN(n) || n <= 0 ? null : n;
}
export function formatIncline(v: number): string {
  return `${v}%`;
}
export function formatLevel(v: number): string {
  return `${v}단계`;
}

// 유산소 세트 배열의 총 시간(초)·총 거리(미터) 합 — 종목 요약용(수행 세트만).
export function sumCardio(sets: { durationSec?: number | null; distanceM?: number | null }[]): {
  durationSec: number;
  distanceM: number;
} {
  let durationSec = 0;
  let distanceM = 0;
  for (const s of sets) {
    if (s.durationSec && s.durationSec > 0) durationSec += s.durationSec;
    if (s.distanceM && s.distanceM > 0) distanceM += s.distanceM;
  }
  return { durationSec, distanceM };
}
