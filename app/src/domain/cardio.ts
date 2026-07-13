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
