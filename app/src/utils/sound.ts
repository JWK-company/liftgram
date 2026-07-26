// @plm SRS-003  휴식 종료 알림음(웹 Web Audio 신스 프리셋 + 진동, 네이티브 진동). 음량·프리셋 커스텀.
// v2: (Bug1) 잠금/백그라운드에서도 정확히 울리도록 setInterval 대신 오디오 하드웨어 클록에 '예약' +
//     키프얼라이브(AudioContext interrupted 방지). (Bug2) 마스터 리미터 버스+과포화로 음악에 안 묻히게.
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

// ── Bug2: 마스터 버스 — 모든 비프가 destination 대신 여기로. tanh 소프트클립(과포화)이 배음을 더해
//    같은 피크에서 RMS(지각 음량)를 끌어올린다. tanh는 입력이 아무리 커도 출력을 ±tanh(k)<1로 한정하므로
//    클리핑 방지 역할까지 겸한다(여러 오실레이터 합산도 안전). DynamicsCompressor는 makeup gain이 없어
//    오히려 음량을 낮추므로 쓰지 않는다 — 소프트클립만으로 클립 없이 최대 라우드니스. ───────────────
let masterInput: GainNode | null = null;
function masterBus(ctx: AudioContext): GainNode {
  if (masterInput && masterInput.context === ctx) return masterInput;
  const input = ctx.createGain();
  input.gain.value = 1;
  const shaper = ctx.createWaveShaper();
  shaper.curve = TANH_CURVE; // tanh 소프트클립(입력 [-1,1] → 포화). 구동량↑ = 더 사각파 = 더 큰 RMS.
  shaper.oversample = '4x'; // 앨리어싱/거슬림 완화
  const out = ctx.createGain();
  out.gain.value = 0.97; // 최종 헤드룸(tanh(2.5)=0.987 × 0.97 < 1.0 — 디지털 클립 없음)
  input.connect(shaper);
  shaper.connect(out);
  out.connect(ctx.destination);
  masterInput = input;
  return input;
}

// ── 커스텀 설정(기기-로컬 prefs) ─────────────────────────────────────
export type RestSoundKind = 'ding' | 'chime' | 'triad' | 'buzz';
export const REST_SOUND_KINDS: RestSoundKind[] = ['ding', 'chime', 'triad', 'buzz'];

export type RestVolumeLevel = 'mid' | 'loud' | 'max';
export const REST_VOLUME_LEVELS: RestVolumeLevel[] = ['mid', 'loud', 'max'];
const VOLUME_PEAK: Record<RestVolumeLevel, number> = { mid: 0.5, loud: 0.8, max: 1.0 };

// Bug2: 마스터 버스(beep2)용 구동량. tanh 소프트클립에 얼마나 밀어넣을지 → 포화 정도 = 지각 음량.
// max(3.0)는 파형을 사각파에 가깝게 포화시켜 같은 피크에서 RMS↑ → 음악 위로 확실히 들린다.
// 측정(구 대비): loud +2.9dB, max +3.9dB(구 "크게" 기준) + 배음으로 귀에 민감한 대역까지 밝아짐.
// (구 beep는 VOLUME_PEAK로 destination 직결 — 폴백/원복용으로 유지.)
const VOLUME_DRIVE: Record<RestVolumeLevel, number> = { mid: 0.6, loud: 1.3, max: 3.0 };

// tanh 소프트클립 커브(모듈 로드 시 1회). 입력 [-1,1]을 배음 포함 파형으로 매핑. k=포화 강도.
// 주석 없이 new Float32Array 추론형 유지 → WaveShaperNode.curve(Float32Array<ArrayBuffer>)와 호환.
const TANH_CURVE = (() => {
  const n = 2048;
  const c = new Float32Array(n);
  const k = 2.5;
  for (let i = 0; i < n; i += 1) {
    const x = (i * 2) / (n - 1) - 1;
    c[i] = Math.tanh(k * x);
  }
  return c;
})();

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

// Bug2: 마스터 소프트클립 버스 경유 비프. sine→triangle(배음↑) + VOLUME_DRIVE로 과포화 → 지각 음량↑.
// 반환한 OscillatorNode는 예약 취소(stop)·완료감지(onended)에 쓰인다.
function beep2(
  ctx: AudioContext,
  freq: number,
  startAt: number,
  dur: number,
  opts?: { type?: OscillatorType; peak?: number },
): OscillatorNode {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts?.type ?? 'triangle';
  osc.frequency.setValueAtTime(freq, startAt);
  // 프리셋 개별 비중(peak) × 사용자 구동량. 마스터 tanh가 [-1,1] 밖을 포화시키므로 1.0 초과 허용.
  const peak = Math.max(0.0002, (opts?.peak ?? 1) * VOLUME_DRIVE[restVolume]);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.connect(gain);
  gain.connect(masterBus(ctx)); // ← destination 대신 리미터 버스
  osc.start(startAt);
  osc.stop(startAt + dur + 0.05);
  return osc;
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

// Bug1/Bug2: playPattern의 마스터 버스 버전 — 절대 시각(startAt)에 재생(오디오 클록 예약) +
// 생성 노드 수집(취소용) + 마지막 노드 onended로 '실제로 소리 났음'을 1회 통지(onFired).
// 즉시 재생은 startAt = ctx.currentTime.
function playPatternAt(
  ctx: AudioContext,
  kind: RestSoundKind,
  startAt: number,
  collect?: OscillatorNode[],
  onFired?: () => void,
): void {
  const t = startAt;
  const nodes: OscillatorNode[] = [];
  const push = (o: OscillatorNode) => {
    nodes.push(o);
    if (collect) collect.push(o);
  };
  switch (kind) {
    case 'ding':
      push(beep2(ctx, 880, t, 0.2));
      push(beep2(ctx, 1318.5, t + 0.2, 0.28));
      break;
    case 'chime':
      push(beep2(ctx, 659, t, 0.32, { peak: 0.9 }));
      push(beep2(ctx, 988, t + 0.16, 0.4, { peak: 0.9 }));
      push(beep2(ctx, 1318.5, t + 0.34, 0.6, { peak: 0.85 }));
      break;
    case 'triad':
      push(beep2(ctx, 523.25, t, 0.5, { peak: 0.6 }));
      push(beep2(ctx, 659.25, t, 0.5, { peak: 0.55 }));
      push(beep2(ctx, 784, t, 0.55, { peak: 0.55 }));
      break;
    case 'buzz':
      push(beep2(ctx, 196, t, 0.14, { type: 'square', peak: 0.5 }));
      push(beep2(ctx, 196, t + 0.22, 0.14, { type: 'square', peak: 0.5 }));
      push(beep2(ctx, 196, t + 0.44, 0.2, { type: 'square', peak: 0.5 }));
      break;
  }
  // 마지막으로 끝나는 노드의 onended = 실제 재생 완료 신호(잠금 인터럽트면 복귀 후에야 발화).
  if (onFired && nodes.length) {
    nodes[nodes.length - 1].onended = () => onFired();
  }
}

// 사용자 제스처(세트 완료 체크 등) 시 호출 — 웹 오디오 잠금 해제/재개.
// iOS/모바일은 제스처 없이 생성한 컨텍스트가 suspended라 나중에 소리가 안 남 → 여기서 미리 깨운다.
export function primeRestSound(): void {
  const ctx = webAudioContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

// 휴식 종료 알림(즉시 재생) — 웹은 선택 프리셋 + 진동, 네이티브는 진동.
// 웹에서 이 함수는 이제 '오디오 클록 예약 미지원' 폴백 경로다(정상 경로는 scheduleRestDone).
export function playRestDone(): void {
  if (Platform.OS === 'web') {
    const ctx = webAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      // playPattern(ctx, restKind);                          // [원본] 원복 시 주석 해제(구 신스, destination 직결)
      try { playPatternAt(ctx, restKind, ctx.currentTime); } catch { /* closed ctx 등 무시 */ } // [개선] 리미터 체인(더 큼)
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
    // playPattern(ctx, kind);                          // [원본] 원복 시 주석 해제
    try { playPatternAt(ctx, kind, ctx.currentTime); } catch { /* closed ctx 등 무시 */ } // [개선] 새 라우드니스 체인으로 미리듣기
  }
}

// ════════════════════════════════════════════════════════════════════════════════════
// Bug1(web): 잠금/백그라운드에서도 휴식 알림이 제때 울리게 — 오디오 하드웨어 클록 '예약' + 키프얼라이브.
//   • 모바일 브라우저는 잠금 시 setInterval을 정지/스로틀 → 인터벌로 소리를 내면 잠금 중 안 울리고
//     화면을 켜야 밀린 알람이 뒤늦게 난다(사용자 증상). → 소리는 인터벌이 아니라 오디오 클록에 예약.
//   • iOS는 잠금 시 AudioContext가 'interrupted'되어 currentTime이 멈춤 → 극소음 오실레이터 +
//     재생 중 <audio>(MediaSession)로 세션을 살려둔다. 실패해도 복귀 시 flush로 즉시 보정(무음 방지).
// ════════════════════════════════════════════════════════════════════════════════════

// ── 키프얼라이브(운동 세션 동안 1회 유지; 회당 stop/restart 금지 — WebKit 261858) ──
let keepAliveOsc: OscillatorNode | null = null;
let keepAliveEl: HTMLAudioElement | null = null;

// 거의-무음(디지털 0 아님) 짧은 저주파 WAV — iOS '무음 30초 사망' 회피. 폰 스피커엔 사실상 안 들림.
function nearSilentWavDataUri(): string {
  const sr = 8000;
  const len = Math.floor(sr * 0.5);
  const buf = new ArrayBuffer(44 + len * 2);
  const dv = new DataView(buf);
  const ws = (o: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) dv.setUint8(o + i, s.charCodeAt(i));
  };
  ws(0, 'RIFF');
  dv.setUint32(4, 36 + len * 2, true);
  ws(8, 'WAVE');
  ws(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  ws(36, 'data');
  dv.setUint32(40, len * 2, true);
  for (let i = 0; i < len; i += 1) {
    // ~60Hz, 진폭 ±4(약 -78dB) — 비-무음이지만 사실상 안 들림.
    dv.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 60 * i) / sr) * 4), true);
  }
  let bin = '';
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < u8.length; i += 1) bin += String.fromCharCode(u8[i]);
  return `data:audio/wav;base64,${typeof btoa !== 'undefined' ? btoa(bin) : ''}`;
}

function startKeepAlive(): void {
  const ctx = webAudioContext();
  if (!ctx) return;
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  try {
    const navAny = navigator as unknown as { audioSession?: { type: string } };
    if (navAny.audioSession) navAny.audioSession.type = 'playback'; // 백그라운드 재생 의도 선언(iOS)
  } catch {
    /* 미지원 무시 */
  }
  if (!keepAliveOsc) {
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.0001; // 0이 아닌 극소값(0이면 'silent' 최적화→interrupt)
      osc.frequency.value = 30;
      osc.connect(g);
      g.connect(ctx.destination); // 리미터 우회(진짜 무음)
      osc.start();
      keepAliveOsc = osc;
    } catch {
      /* no-op */
    }
  }
  if (typeof document !== 'undefined' && !keepAliveEl) {
    try {
      const el = document.createElement('audio');
      el.loop = true;
      el.setAttribute('playsinline', '');
      (el as unknown as { playsInline?: boolean }).playsInline = true;
      el.src = nearSilentWavDataUri();
      el.volume = 1;
      document.body.appendChild(el);
      void el.play().catch(() => {});
      keepAliveEl = el;
      const navAny = navigator as unknown as {
        mediaSession?: { metadata: unknown; setActionHandler: (a: string, h: (() => void) | null) => void };
      };
      const MM = (window as unknown as { MediaMetadata?: new (i: object) => unknown }).MediaMetadata;
      if (navAny.mediaSession && MM) {
        navAny.mediaSession.metadata = new MM({ title: '휴식 타이머', artist: 'Liftgram' });
        try {
          navAny.mediaSession.setActionHandler('play', () => {
            void el.play().catch(() => {});
          });
        } catch {
          /* 미지원 무시 */
        }
        try {
          navAny.mediaSession.setActionHandler('pause', () => {});
        } catch {
          /* 미지원 무시 */
        }
      }
    } catch {
      /* graceful */
    }
  }
}

// 운동 종료/언마운트 시 정리(휴식 스킵/재시작 시에는 호출하지 않음 — 세션 내 연속 유지).
export function stopKeepAlive(): void {
  try {
    keepAliveOsc?.stop();
  } catch {
    /* no-op */
  }
  try {
    keepAliveOsc?.disconnect();
  } catch {
    /* no-op */
  }
  keepAliveOsc = null;
  if (keepAliveEl) {
    try {
      keepAliveEl.pause();
      keepAliveEl.remove();
    } catch {
      /* no-op */
    }
    keepAliveEl = null;
  }
}

// ── 예약/보정 상태 ──
let scheduledNodes: OscillatorNode[] = [];
let scheduledFireCtxTime: number | null = null; // 예약 발화 시각(오디오 클록)
let restEndWallMs: number | null = null; // 발화 시각(월클럭) — 인터럽트 후 재산정·마감 판정 기준
let restBeepFired = false; // 이미 소리 났나(이중재생 방지 단일 게이트)
let rearmBound = false;

function stopScheduledNodes(): void {
  for (const n of scheduledNodes) {
    try {
      n.onended = null; // stop()이 onended를 유발해 finishRestBeep를 오발동시키지 않도록 먼저 제거
    } catch {
      /* no-op */
    }
    try {
      n.stop();
    } catch {
      /* no-op */
    }
    try {
      n.disconnect();
    } catch {
      /* no-op */
    }
  }
  scheduledNodes = [];
}

// 자연 완료(onended) 또는 flush 재생 후 1회 정리. 소리는 이미 났으므로 남은 노드는 stop하지 않음.
function finishRestBeep(): void {
  restBeepFired = true;
  scheduledFireCtxTime = null;
  restEndWallMs = null;
  scheduledNodes = [];
  unbindRearm();
}

function armAt(ctx: AudioContext, sec: number): boolean {
  try {
    scheduledFireCtxTime = ctx.currentTime + Math.max(0, sec);
    playPatternAt(ctx, restKind, scheduledFireCtxTime, scheduledNodes, finishRestBeep);
    return true;
  } catch {
    return false;
  }
}

function rearm(): void {
  const ctx = audioCtx;
  if (!ctx || restEndWallMs == null || restBeepFired) return;
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  const remMs = restEndWallMs - Date.now();
  if (remMs > 200) {
    // 인터럽트로 오디오 클록이 밀렸을 수 있으니 남은 시간으로 재예약(마감은 그대로).
    stopScheduledNodes();
    armAt(ctx, remMs / 1000);
  } else {
    flushIfMissedRestBeep();
  }
}

function bindRearm(): void {
  if (rearmBound || typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', rearm);
  try {
    audioCtx?.addEventListener('statechange', rearm);
  } catch {
    /* no-op */
  }
  rearmBound = true;
}
function unbindRearm(): void {
  if (!rearmBound || typeof document === 'undefined') return;
  document.removeEventListener('visibilitychange', rearm);
  try {
    audioCtx?.removeEventListener('statechange', rearm);
  } catch {
    /* no-op */
  }
  rearmBound = false;
}

// 휴식 시작/+15s에서 호출. true=오디오 클록 예약 성공(인터벌은 소리 안 냄) · false=미지원(인터벌이 폴백 재생).
export function scheduleRestDone(sec: number): boolean {
  if (Platform.OS !== 'web') return false;
  const ctx = webAudioContext();
  if (!ctx) return false;
  cancelScheduledRestDone(); // 이전 예약 완전 정리
  startKeepAlive();
  restBeepFired = false;
  const ok = armAt(ctx, sec);
  if (!ok) {
    cancelScheduledRestDone(); // 실패 시 월클럭/리스너까지 되돌린다(이중재생 방지)
    return false;
  }
  restEndWallMs = Date.now() + Math.max(0, sec) * 1000;
  bindRearm();
  return true;
}

export function cancelScheduledRestDone(): void {
  stopScheduledNodes();
  scheduledFireCtxTime = null;
  restEndWallMs = null;
  restBeepFired = false;
  unbindRearm();
}

// 잠금 인터럽트로 예약이 밀렸을 때 즉시 보정 재생(무음 방지). 이중재생 판정은 '오디오 클록' 기준:
//   • 마감(월클럭)이 지났는데도 오디오 클록(currentTime)이 예약 시각에 못 미치면 = 인터럽트로 클록이
//     뒤처져 예약 노드가 제때 못 울린다 → 지금 즉시 재생.
//   • currentTime이 예약 시각에 근접/도달했으면 예약 노드가 곧/이미 울린다 → 건드리지 않음(이중 방지).
// (ctx.state 기준으로 판정하면 인터럽트→복귀 직후 state는 'running'이지만 클록은 뒤처진 상태를 놓친다.)
export function flushIfMissedRestBeep(): void {
  if (Platform.OS !== 'web') return;
  const ctx = audioCtx;
  if (restBeepFired || restEndWallMs == null || scheduledFireCtxTime == null || !ctx) return;
  if (Date.now() < restEndWallMs) return; // 아직 마감 전
  if (ctx.currentTime >= scheduledFireCtxTime - 0.05) return; // 예약 노드가 곧/이미 발화 → 이중 방지
  try {
    void ctx.resume().catch(() => {});
    stopScheduledNodes();
    finishRestBeep(); // 게이트 잠금(이중 방지)
    playPatternAt(ctx, restKind, ctx.currentTime); // 즉시(복귀 직후)
  } catch {
    /* no-op */
  }
}

// 웹 전용 보조 진동(소리는 예약 노드가 냄 → 문서 보일 때만 의미).
export function vibrateRestDone(): void {
  if (Platform.OS !== 'web') return;
  try {
    (navigator as unknown as { vibrate?: (p: number | number[]) => boolean }).vibrate?.([0, 120, 60, 120]);
  } catch {
    /* 미지원 브라우저 무시 */
  }
}

// ════════════════════════════════════════════════════════════════════════════════════
// 잠금화면 Now Playing 카드(표시 전용) — keepAliveEl이 재생 중이라 브라우저가 오디오 포커스를 잡아
// 시스템 미디어 카드가 뜬다(Android 설치형 PWA에서 잘 됨). 여기선 그 카드의 '표시'만 갱신한다:
//   • 운동명 → title, "세트 N/총" → artist, 루틴 → album
//   • 휴식 카운트다운 → setPositionState 진행바(OS가 playbackRate로 스스로 보간 → 잠금 중 JS 타이머 스로틀 회피)
// 주의: 오디오 클록 예약 알람과 완전 독립 — keepAliveEl을 절대 pause하지 않는다(pause 시 카드 붕괴).
// 버튼(액션 핸들러)은 잠금 중 실행 보장이 불확실하고 재예약이 알람을 침묵시킬 위험이 있어 붙이지 않는다(실기기 검증 후 별도).
// iOS PWA는 카드/진행바가 대부분 미표시·불안정 — feature-detect 후 graceful no-op.
// ════════════════════════════════════════════════════════════════════════════════════
type MediaSessionLike = {
  metadata: unknown;
  playbackState: string;
  setPositionState?: (s: { duration: number; position: number; playbackRate: number }) => void;
};
function mediaSessionObj(): MediaSessionLike | null {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return null;
  return (navigator as unknown as { mediaSession?: MediaSessionLike }).mediaSession ?? null;
}

// 종목/세트 전환(이산 이벤트)마다 1회 호출 — 카드 텍스트 갱신. 매초 호출 금지(알림 리빌드·깜빡임).
export function setWorkoutNowPlaying(info: { exercise: string; setInfo?: string; routine?: string | null }): void {
  const ms = mediaSessionObj();
  const MM = typeof window !== 'undefined' ? (window as unknown as { MediaMetadata?: new (i: object) => unknown }).MediaMetadata : undefined;
  if (!ms || !MM || !info.exercise) return;
  try {
    ms.metadata = new MM({ title: info.exercise, artist: info.setInfo ?? '', album: info.routine ?? 'Liftgram' });
    ms.playbackState = 'playing';
  } catch {
    /* 미지원 무시 */
  }
}

// 휴식 진행바 — OS가 스스로 틱(보간)하므로 시작·+15s·스킵 때만 호출(매초 금지).
// duration=총초, position=경과초(=총-남음), rate=1 → 바가 휴식 동안 차오른다.
export function setRestProgress(totalSec: number, remainingSec: number): void {
  const ms = mediaSessionObj();
  if (!ms || typeof ms.setPositionState !== 'function') return;
  const duration = Math.max(0.1, totalSec);
  const position = Math.min(duration, Math.max(0, totalSec - remainingSec));
  try {
    ms.setPositionState({ duration, position, playbackRate: 1 });
  } catch {
    /* iOS 등 불안정 무시 */
  }
}

// 휴식 종료/스킵 — 진행바 정지(카드·텍스트는 유지: 키프얼라이브 지속).
export function endRestProgress(): void {
  const ms = mediaSessionObj();
  if (!ms || typeof ms.setPositionState !== 'function') return;
  try {
    ms.setPositionState({ duration: 1, position: 1, playbackRate: 0 });
  } catch {
    /* no-op */
  }
}
