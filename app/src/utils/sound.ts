// @plm SRS-003  휴식 종료 알림음(웹 Web Audio 신스 프리셋 + 진동, 네이티브 진동). 음량·프리셋 커스텀.
import { Platform, Vibration } from 'react-native';
import { getPref, setPref } from '../sync/prefs';

// 웹 오디오 컨텍스트는 1개만 재사용. 최초 사용자 제스처 때 생성/재개해야 재생이 허용된다.
let audioCtx: AudioContext | null = null;

function webAudioContext(): AudioContext | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
    .AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) {
    try {
      audioCtx = new AC();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

// ── 커스텀 설정(기기-로컬 prefs) ─────────────────────────────────────
export type RestSoundKind = 'ding' | 'chime' | 'triad' | 'buzz';
export const REST_SOUND_KINDS: RestSoundKind[] = ['ding', 'chime', 'triad', 'buzz'];

export type RestVolumeLevel = 'mid' | 'loud' | 'max';
export const REST_VOLUME_LEVELS: RestVolumeLevel[] = ['mid', 'loud', 'max'];
const VOLUME_PEAK: Record<RestVolumeLevel, number> = { mid: 0.5, loud: 0.8, max: 1.0 };

const PREF_KIND = 'liftgram.restSound';
const PREF_VOL = 'liftgram.restVolume';

let restKind: RestSoundKind = 'ding';
let restVolume: RestVolumeLevel = 'loud'; // 기존 0.25 → 0.8 기본(더 크게)

export function getRestSoundKind(): RestSoundKind {
  return restKind;
}
export function getRestVolumeLevel(): RestVolumeLevel {
  return restVolume;
}
export function setRestSoundKind(kind: RestSoundKind): void {
  restKind = kind;
  void setPref(PREF_KIND, kind);
}
export function setRestVolumeLevel(level: RestVolumeLevel): void {
  restVolume = level;
  void setPref(PREF_VOL, level);
}

// 앱 부팅 시 저장된 설정 로드(모듈 import 시 1회 자동 실행 — 휴식은 수 초 뒤라 로드 완료됨).
export async function initRestSoundPrefs(): Promise<void> {
  try {
    const [k, v] = await Promise.all([getPref(PREF_KIND), getPref(PREF_VOL)]);
    if (k && (REST_SOUND_KINDS as string[]).includes(k)) restKind = k as RestSoundKind;
    if (v && (REST_VOLUME_LEVELS as string[]).includes(v)) restVolume = v as RestVolumeLevel;
  } catch {
    /* 로드 실패 — 기본값 유지 */
  }
}
void initRestSoundPrefs();

// ── 신스 비프 ────────────────────────────────────────────────────────
function beep(
  ctx: AudioContext,
  freq: number,
  startAt: number,
  dur: number,
  opts?: { type?: OscillatorType; peak?: number },
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts?.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, startAt);
  // 음량 = 프리셋 개별 비중(peak) × 사용자 볼륨 레벨. 클릭음 방지 페이드 인/아웃.
  const peak = Math.max(0.0002, (opts?.peak ?? 1) * VOLUME_PEAK[restVolume]);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.02);
}

// 프리셋별 패턴 — 전부 신스(에셋 무의존).
function playPattern(ctx: AudioContext, kind: RestSoundKind): void {
  const t = ctx.currentTime;
  switch (kind) {
    case 'ding': // 상승 2음 "딩–동"
      beep(ctx, 880, t, 0.2);
      beep(ctx, 1318.5, t + 0.2, 0.28);
      break;
    case 'chime': // 벨 — 3음 상승 아르페지오, 긴 여운
      beep(ctx, 659, t, 0.32, { peak: 0.9 });
      beep(ctx, 988, t + 0.16, 0.4, { peak: 0.9 });
      beep(ctx, 1318.5, t + 0.34, 0.6, { peak: 0.85 });
      break;
    case 'triad': // 화음 — 도·미·솔 동시
      beep(ctx, 523.25, t, 0.5, { peak: 0.6 });
      beep(ctx, 659.25, t, 0.5, { peak: 0.55 });
      beep(ctx, 784, t, 0.55, { peak: 0.55 });
      break;
    case 'buzz': // 부저 — 낮은 사각파 3연타(가장 주목도 높음)
      beep(ctx, 196, t, 0.14, { type: 'square', peak: 0.5 });
      beep(ctx, 196, t + 0.22, 0.14, { type: 'square', peak: 0.5 });
      beep(ctx, 196, t + 0.44, 0.2, { type: 'square', peak: 0.5 });
      break;
  }
}

// 사용자 제스처(세트 완료 체크 등) 시 호출 — 웹 오디오 잠금 해제/재개.
// iOS/모바일은 제스처 없이 생성한 컨텍스트가 suspended라 나중에 소리가 안 남 → 여기서 미리 깨운다.
export function primeRestSound(): void {
  const ctx = webAudioContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

// 휴식 종료 알림 — 웹은 선택 프리셋 + 진동, 네이티브는 진동.
export function playRestDone(): void {
  if (Platform.OS === 'web') {
    const ctx = webAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      playPattern(ctx, restKind);
    }
    try {
      (navigator as unknown as { vibrate?: (p: number | number[]) => boolean }).vibrate?.([0, 120, 60, 120]);
    } catch {
      /* 미지원 브라우저 무시 */
    }
    return;
  }
  // 네이티브: 사운드 라이브러리 미탑재 → 진동으로 알림(무음모드에서도 인지 가능).
  try {
    Vibration.vibrate([0, 200, 100, 200]);
  } catch {
    /* no-op */
  }
}

// 설정에서 미리듣기 — 지정 프리셋을 현재 볼륨으로 즉시 재생(웹).
export function previewRestSound(kind: RestSoundKind): void {
  const ctx = webAudioContext();
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    playPattern(ctx, kind);
  }
}
