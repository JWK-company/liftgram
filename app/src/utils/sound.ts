// @plm SRS-003  휴식 종료 알림음(웹 Web Audio 비프 + 진동, 네이티브 진동)
import { Platform, Vibration } from 'react-native';

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

// 사용자 제스처(세트 완료 체크 등) 시 호출 — 웹 오디오 잠금 해제/재개.
// iOS/모바일은 제스처 없이 생성한 컨텍스트가 suspended라 나중에 소리가 안 남 → 여기서 미리 깨운다.
export function primeRestSound(): void {
  const ctx = webAudioContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

function beep(ctx: AudioContext, freq: number, startAt: number, dur: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, startAt);
  // 클릭음 방지용 짧은 페이드 인/아웃 엔벨로프(0으로는 못 감 → 0.0001).
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.25, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.02);
}

// 휴식 종료 알림 — 웹은 상승 2음 비프 + 진동, 네이티브는 진동.
export function playRestDone(): void {
  if (Platform.OS === 'web') {
    const ctx = webAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const t = ctx.currentTime;
      beep(ctx, 880, t, 0.18); // 라
      beep(ctx, 1318.5, t + 0.2, 0.24); // 상승 "딩–동"
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
