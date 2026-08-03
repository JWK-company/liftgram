// @plm SRS-003  휴식 종료 알림음 — app의 utils/sound.ts 중 **웹에 해당하는 부분**만
//
// ─────────────────────────────────────────────────────────────────────────────
// 헬스장에서는 음악을 들으며 운동한다. 그 위로 들리지 않으면 알림음은 없는 것과 같다.
// 그래서 app은 두 가지를 한다 — 여기서도 같게 옮겼다:
//
//   ① **소프트클립 마스터 버스**(tanh) — 피크를 넘기지 않으면서 파형을 포화시켜 배음을 만든다.
//      같은 피크에서 RMS가 올라가 "더 크게" 들린다. 컴프레서는 메이크업 게인이 없어 오히려 작아진다.
//   ② 프리셋별 개별 비중(peak) × 사용자 음량(구동량) — 프리셋마다 체감 크기를 맞춘다.
//
// 프리셋 4종(딩·차임·화음·부저)의 주파수·길이·비중은 app 값을 그대로 옮겼다. 설정은 기기-로컬이고
// **키도 app과 같다**(`liftgram.restSound`·`liftgram.restVolume`) — 두 구현을 오가도 설정이 이어진다.
//
// app에만 있는 것(여기서 뺀 것): 잠금화면 MediaSession 카드 · keep-alive 오실레이터 · 네이티브 알람.
// 그건 화면이 꺼진 폰에서 소리를 내기 위한 장치라 브라우저 탭에는 해당하지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import { getPref, setPref } from "./prefs";

export type RestSoundKind = "ding" | "chime" | "triad" | "buzz";
export const REST_SOUND_KINDS: RestSoundKind[] = ["ding", "chime", "triad", "buzz"];

export type RestVolumeLevel = "mid" | "loud" | "max";
export const REST_VOLUME_LEVELS: RestVolumeLevel[] = ["mid", "loud", "max"];

/** 소프트클립에 얼마나 밀어넣을지 — 포화 정도가 곧 지각 음량이다(app과 같은 값). */
const VOLUME_DRIVE: Record<RestVolumeLevel, number> = { mid: 0.6, loud: 1.3, max: 3.0 };

const PREF_KIND = "liftgram.restSound";
const PREF_VOL = "liftgram.restVolume";

export function getRestSoundKind(): RestSoundKind {
  const v = getPref(PREF_KIND);
  return REST_SOUND_KINDS.includes(v as RestSoundKind) ? (v as RestSoundKind) : "ding";
}

export function getRestVolumeLevel(): RestVolumeLevel {
  const v = getPref(PREF_VOL);
  // 기본이 'loud'인 것은 app과 같다 — 음악 위로 들려야 하기 때문이다.
  return REST_VOLUME_LEVELS.includes(v as RestVolumeLevel) ? (v as RestVolumeLevel) : "loud";
}

export function setRestSoundKind(kind: RestSoundKind): void {
  setPref(PREF_KIND, kind);
}

export function setRestVolumeLevel(level: RestVolumeLevel): void {
  setPref(PREF_VOL, level);
}

/** tanh 곡선 — 입력 [-1,1]을 배음이 실린 파형으로 매핑한다. k가 포화 강도. */
const TANH_CURVE = (() => {
  const n = 2048;
  const c = new Float32Array(n);
  const k = 2.5;
  for (let i = 0; i < n; i += 1) c[i] = Math.tanh(k * ((i * 2) / (n - 1) - 1));
  return c;
})();

let ctxRef: AudioContext | null = null;
let busRef: GainNode | null = null;

function audioContext(): AudioContext | null {
  if (ctxRef) return ctxRef;
  const Ctor =
    typeof window === "undefined"
      ? undefined
      : (window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) return null;
  ctxRef = new Ctor();
  return ctxRef;
}

/** 소프트클립 버스 — 모든 소리가 여기를 지나간다. 한 번만 만든다. */
function masterBus(ctx: AudioContext): GainNode {
  if (busRef) return busRef;
  const input = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  shaper.curve = TANH_CURVE;
  shaper.oversample = "2x";
  const out = ctx.createGain();
  out.gain.value = 0.9;
  input.connect(shaper);
  shaper.connect(out);
  out.connect(ctx.destination);
  busRef = input;
  return input;
}

function beep(
  ctx: AudioContext,
  freq: number,
  startAt: number,
  dur: number,
  opts?: { type?: OscillatorType; peak?: number },
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts?.type ?? "triangle";
  osc.frequency.setValueAtTime(freq, startAt);
  // 마스터가 [-1,1] 밖을 포화시키므로 1.0을 넘겨도 된다 — 그게 곧 음량이다.
  const peak = Math.max(0.0002, (opts?.peak ?? 1) * VOLUME_DRIVE[getRestVolumeLevel()]);
  // 여닫이를 지수로 — 딱 끊으면 '틱' 소리가 난다.
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.connect(gain);
  gain.connect(masterBus(ctx));
  osc.start(startAt);
  osc.stop(startAt + dur + 0.05);
}

/**
 * 프리셋을 그 자리에서 재생한다.
 *
 * 사용자 조작 없이 시작하면 브라우저가 막는다 — 세트 체크 직후라 대개 통과하지만,
 * 막히면 조용히 넘어간다(알림이 안 되는 것이 화면이 죽는 것보다 낫다).
 */
export function playRestSound(kind: RestSoundKind = getRestSoundKind()): void {
  try {
    const ctx = audioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;

    switch (kind) {
      case "ding": // 상승 2음 "딩–동"
        beep(ctx, 880, t, 0.2);
        beep(ctx, 1318.5, t + 0.2, 0.28);
        break;
      case "chime": // 벨 — 3음 상승 아르페지오, 긴 여운
        beep(ctx, 659, t, 0.32, { peak: 0.9 });
        beep(ctx, 988, t + 0.16, 0.4, { peak: 0.9 });
        beep(ctx, 1318.5, t + 0.34, 0.6, { peak: 0.85 });
        break;
      case "triad": // 화음 — 도·미·솔 동시
        beep(ctx, 523.25, t, 0.5, { peak: 0.6 });
        beep(ctx, 659.25, t, 0.5, { peak: 0.55 });
        beep(ctx, 784, t, 0.55, { peak: 0.55 });
        break;
      case "buzz": // 부저 — 낮은 사각파 3연타(가장 주목도 높다)
        beep(ctx, 196, t, 0.14, { type: "square", peak: 0.5 });
        beep(ctx, 196, t + 0.22, 0.14, { type: "square", peak: 0.5 });
        beep(ctx, 196, t + 0.44, 0.2, { type: "square", peak: 0.5 });
        break;
    }
  } catch {
    // 소리가 안 나는 것으로 끝낸다.
  }
}

/** 휴식이 끝났을 때 — 소리 + (되면) 진동. */
export function notifyRestDone(): void {
  try {
    navigator.vibrate?.([120, 60, 120]);
  } catch {
    // 진동이 없는 기기 — 소리만.
  }
  playRestSound();
}
