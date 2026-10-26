// @plm SRS-055  종목 픽토그램 리그 — 관절 각도로 사람을 그리고, 기구 부품을 붙여 SVG 문자열로 낸다(ADR-036).
//
// ─────────────────────────────────────────────────────────────────────────────
// 그림은 전부 이 파일의 규칙에서 나온다(자체 제작 · GPU 없음 · 저작권 위험 없음).
//
//   · 사람 = 분절(몸통·위팔·아래팔·넓적다리·정강이·발)의 **절대 각도** + 기준 관절 하나의 위치.
//     각도는 SVG 좌표계 그대로다: 0 = 오른쪽, 90 = 아래, -90 = 위, 180 = 왼쪽.
//   · 옆모습(side)과 앞모습(front) 두 리그가 있다 — 레터럴 레이즈·풀업처럼 옆에서 보면 동작이
//     안 보이는 종목은 앞모습으로 그린다.
//   · 길이·굵기는 고정이다. 그래서 모든 종목이 같은 사람·같은 굵기로 보인다(화풍 통일).
//   · 색은 CSS 변수 — 앱 토큰을 따라 라이트·다크가 저절로 바뀐다. 근육 강조만 브랜드 색.
//
// 자세 데이터는 poses.ts, 종목 → 자세·기구 결정은 render.ts.
// ─────────────────────────────────────────────────────────────────────────────

export const VIEW_W = 240;
export const VIEW_H = 200;
export const GROUND_Y = 188;

/** 분절 길이(px) — 고정 비율. */
export const L = { torso: 58, neck: 19, head: 11, upper: 30, fore: 27, thigh: 38, shin: 37, foot: 12 } as const;
/** 선 굵기 — 고정. */
const W = { limb: 11, leg: 13, torso: 17, far: 9 } as const;

/** 앱 토큰을 따른다 — 토큰이 없는 곳(렌더 시트 등)에서는 뒤의 기본값. */
export const COLOR = {
  ink: 'var(--picto-ink, var(--color-ink, #2B2F36))',
  far: 'var(--picto-far, var(--color-ink3, #9AA0A8))',
  accent: 'var(--picto-accent, var(--color-brand, #FF5A36))',
  equip: 'var(--picto-equip, var(--color-ink2, #6B7280))',
  soft: 'var(--picto-soft, var(--color-line-strong, #C9CDD3))',
} as const;

export type Pt = [number, number];

export type Equip =
  | 'barbell'
  | 'dumbbell'
  | 'kettlebell'
  | 'cable'
  | 'band'
  | 'machine'
  | 'smith'
  | 'ezbar'
  | 'trapbar'
  | 'bodyweight'
  | 'other';

export type Muscle =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'abs'
  | 'traps'
  | 'fullBody'
  | 'other'
  | 'cardio';

// ── 자세 ────────────────────────────────────────────────────────────────────

/** 관절 이름 — 기준점·기구 고정점으로 쓴다. 2 가 붙은 것은 먼 쪽(뒤쪽) 팔다리. */
export type Joint =
  | 'hip'
  | 'sh'
  | 'neck'
  | 'head'
  | 'el'
  | 'wr'
  | 'kn'
  | 'an'
  | 'toe'
  | 'el2'
  | 'wr2'
  | 'kn2'
  | 'an2'
  | 'toe2'
  | 'chest'
  | 'mid'
  | 'sh2';

/**
 * 옆모습 자세. 몸은 오른쪽을 본다(팔을 앞으로 뻗으면 0°).
 * a = 가까운 팔 [위팔, 아래팔] · l = 가까운 다리 [넓적다리, 정강이, 발]. 2 는 먼 쪽(없으면 가까운 쪽과 같다).
 */
export interface SidePose {
  view?: 'side';
  t: number;
  hd?: number;
  a: [number, number];
  a2?: [number, number];
  l: [number, number, number?];
  l2?: [number, number, number?];
  /** 이 관절을 이 좌표에 둔다 */
  at: [Joint, number, number];
}

/**
 * 앞모습 자세. r = 그림 오른쪽 팔·다리의 절대각(왼쪽은 좌우 대칭, ll·al 로 따로 줄 수 있다).
 * 팔 각도도 같은 좌표계 — 오른팔을 옆으로 들면 0°, 내리면 90°, 위로 뻗으면 -90°.
 */
export interface FrontPose {
  view: 'front';
  /** 몸통 기울기(도, + = 그림 오른쪽으로) */
  tilt?: number;
  ar: [number, number];
  al?: [number, number];
  lr: [number, number];
  ll?: [number, number];
  /** 앉은 자세 — 넓적다리가 보는 사람 쪽으로 짧아 보인다 */
  seated?: boolean;
  /** 어깨를 끌어올린 정도(px) */
  shrug?: number;
  at: [Joint, number, number];
}

export type Pose = SidePose | FrontPose;

export type Joints = Record<Joint, Pt>;

function pt(o: Pt, ang: number, ln: number): Pt {
  const a = (ang * Math.PI) / 180;
  return [o[0] + ln * Math.cos(a), o[1] + ln * Math.sin(a)];
}

function shift(j: Partial<Joints>, at: [Joint, number, number]): Joints {
  const ref = j[at[0]] as Pt;
  const dx = at[1] - ref[0];
  const dy = at[2] - ref[1];
  const out = {} as Joints;
  for (const k of Object.keys(j) as Joint[]) {
    const p = j[k] as Pt;
    out[k] = [p[0] + dx, p[1] + dy];
  }
  return out;
}

/** 옆모습 관절 좌표. */
export function sideJoints(p: SidePose): Joints {
  const hip: Pt = [0, 0];
  const sh = pt(hip, p.t, L.torso);
  const head = pt(sh, p.hd ?? p.t, L.neck);
  const neck = pt(sh, p.hd ?? p.t, 4);
  const el = pt(sh, p.a[0], L.upper);
  const wr = pt(el, p.a[1], L.fore);
  const a2 = p.a2 ?? p.a;
  const el2 = pt(sh, a2[0], L.upper);
  const wr2 = pt(el2, a2[1], L.fore);
  const kn = pt(hip, p.l[0], L.thigh);
  const an = pt(kn, p.l[1], L.shin);
  const toe = pt(an, p.l[2] ?? 0, L.foot);
  const l2 = p.l2 ?? p.l;
  const kn2 = pt(hip, l2[0], L.thigh);
  const an2 = pt(kn2, l2[1], L.shin);
  const toe2 = pt(an2, l2[2] ?? 0, L.foot);
  const chest = pt(hip, p.t, L.torso * 0.72);
  const mid = pt(hip, p.t, L.torso * 0.45);
  return shift({ hip, sh, sh2: sh, head, neck, el, wr, el2, wr2, kn, an, toe, kn2, an2, toe2, chest, mid }, p.at);
}

const FRONT = { shW: 17, hipW: 9 };

/** 앞모습 관절 좌표 — sh·el·wr·kn·an 은 그림 오른쪽, 2 는 왼쪽. hip 은 골반 가운데. */
export function frontJoints(p: FrontPose): Joints {
  const tilt = p.tilt ?? 0;
  const up = -90 + tilt;
  const hip: Pt = [0, 0];
  const neckBase = pt(hip, up, L.torso);
  const shr = (p.shrug ?? 0) as number;
  const right: Pt = [neckBase[0] + FRONT.shW * Math.cos((tilt * Math.PI) / 180), neckBase[1] + FRONT.shW * Math.sin((tilt * Math.PI) / 180) - shr];
  const left: Pt = [neckBase[0] - FRONT.shW * Math.cos((tilt * Math.PI) / 180), neckBase[1] - FRONT.shW * Math.sin((tilt * Math.PI) / 180) - shr];
  const head = pt(neckBase, up, L.neck);
  const el = pt(right, p.ar[0], L.upper);
  const wr = pt(el, p.ar[1], L.fore);
  const al = p.al ?? [180 - p.ar[0], 180 - p.ar[1]];
  const el2 = pt(left, al[0], L.upper);
  const wr2 = pt(el2, al[1], L.fore);
  const hr: Pt = [FRONT.hipW, 0];
  const hl: Pt = [-FRONT.hipW, 0];
  const ts = p.seated ? 0.35 : 1;
  const kn = pt(hr, p.lr[0], L.thigh * ts);
  const an = pt(kn, p.lr[1], L.shin);
  const ll = p.ll ?? [180 - p.lr[0], 180 - p.lr[1]];
  const kn2 = pt(hl, ll[0], L.thigh * ts);
  const an2 = pt(kn2, ll[1], L.shin);
  const toe: Pt = [an[0] + 5, an[1] + 3];
  const toe2: Pt = [an2[0] - 5, an2[1] + 3];
  const chest = pt(hip, up, L.torso * 0.72);
  const mid = pt(hip, up, L.torso * 0.45);
  return shift(
    { hip, sh: right, sh2: left, neck: neckBase, head, el, wr, el2: el2, wr2, kn, an, toe, kn2, an2, toe2, chest, mid },
    p.at,
  );
}

export function joints(p: Pose): Joints {
  return p.view === 'front' ? frontJoints(p) : sideJoints(p);
}

/** 두 자세 사이 — 각도·기준점을 선형으로 섞는다(움직임 프레임). */
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  // 각도는 가까운 쪽으로 돈다(180 → -70 이 아래를 지나 한 바퀴 돌지 않게)
  const n = (x: number | undefined, y: number | undefined, d: number) => {
    const from = x ?? d;
    let diff = (y ?? d) - from;
    diff = ((((diff + 180) % 360) + 360) % 360) - 180;
    return from + diff * t;
  };
  const pair = (x: number[] | undefined, y: number[] | undefined, dx: number[]): [number, number] => [
    n(x?.[0], y?.[0], dx[0]),
    n(x?.[1], y?.[1], dx[1]),
  ];
  // 두 자세의 기준 관절이 다르면 끝 자세에서 시작 자세의 기준 관절이 놓인 자리를 찾아 그쪽으로 옮긴다
  const bRef: Pt = a.at[0] === b.at[0] ? [b.at[1], b.at[2]] : joints(b)[a.at[0]];
  const at: [Joint, number, number] = [a.at[0], a.at[1] + (bRef[0] - a.at[1]) * t, a.at[2] + (bRef[1] - a.at[2]) * t];
  if (a.view === 'front' && b.view === 'front') {
    return {
      view: 'front',
      tilt: n(a.tilt, b.tilt, 0),
      ar: pair(a.ar, b.ar, a.ar),
      al: a.al || b.al ? pair(a.al ?? [180 - a.ar[0], 180 - a.ar[1]], b.al ?? [180 - b.ar[0], 180 - b.ar[1]], [0, 0]) : undefined,
      lr: pair(a.lr, b.lr, a.lr),
      ll: a.ll || b.ll ? pair(a.ll ?? [180 - a.lr[0], 180 - a.lr[1]], b.ll ?? [180 - b.lr[0], 180 - b.lr[1]], [0, 0]) : undefined,
      seated: a.seated,
      shrug: n(a.shrug, b.shrug, 0),
      at,
    };
  }
  const sa = a as SidePose;
  const sb = b as SidePose;
  const tri = (x: readonly (number | undefined)[] | undefined, y: readonly (number | undefined)[] | undefined, dx: readonly (number | undefined)[]): [number, number, number] => [
    n(x?.[0], y?.[0], dx[0] ?? 0),
    n(x?.[1], y?.[1], dx[1] ?? 0),
    n(x?.[2], y?.[2], dx[2] ?? 0),
  ];
  return {
    t: n(sa.t, sb.t, 0),
    hd: sa.hd != null || sb.hd != null ? n(sa.hd ?? sa.t, sb.hd ?? sb.t, 0) : undefined,
    a: pair(sa.a, sb.a, sa.a),
    a2: sa.a2 || sb.a2 ? pair(sa.a2 ?? sa.a, sb.a2 ?? sb.a, sa.a) : undefined,
    l: tri(sa.l, sb.l, sa.l),
    l2: sa.l2 || sb.l2 ? tri(sa.l2 ?? sa.l, sb.l2 ?? sb.l, sa.l) : undefined,
    at,
  };
}

// ── 그리기 원소 ─────────────────────────────────────────────────────────────

const f = (n: number) => (Math.round(n * 10) / 10).toString();

export function line(a: Pt, b: Pt, w: number, color: string, extra = ''): string {
  return `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"${extra}/>`;
}

export function poly(points: Pt[], color: string, w = 0, fill = 'none'): string {
  const d = points.map((p) => `${f(p[0])},${f(p[1])}`).join(' ');
  return `<polyline points="${d}" fill="${fill}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

export function circle(c: Pt, r: number, fill: string, stroke = 'none', w = 0): string {
  return `<circle cx="${f(c[0])}" cy="${f(c[1])}" r="${f(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/>`;
}

export function rect(x: number, y: number, w: number, h: number, fill: string, rx = 3, extra = ''): string {
  return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${rx}" fill="${fill}"${extra}/>`;
}

/** 두 점을 잇는 두꺼운 판(벤치·패드) — 회전된 직사각형을 굵은 선으로. */
export function slab(a: Pt, b: Pt, thick: number, color: string = COLOR.equip): string {
  return line(a, b, thick, color);
}

// ── 사람 그리기 ─────────────────────────────────────────────────────────────

/** 근육 → 강조할 부위. */
type Part = 'torsoUpper' | 'torsoLower' | 'torso' | 'upperArm' | 'shoulderCap' | 'fore' | 'thigh' | 'shin' | 'glute' | 'neck';

const MUSCLE_PARTS: Record<Muscle, Part[]> = {
  chest: ['torsoUpper'],
  back: ['torso'],
  shoulders: ['shoulderCap'],
  biceps: ['upperArm'],
  triceps: ['upperArm'],
  forearms: ['fore'],
  quads: ['thigh'],
  hamstrings: ['thigh'],
  glutes: ['glute'],
  calves: ['shin'],
  abs: ['torsoLower'],
  traps: ['neck'],
  fullBody: ['torso', 'thigh'],
  other: ['neck'],
  cardio: ['thigh'],
};

/** 옆모습 사람. 먼 쪽 팔다리 → 몸통 → 가까운 다리 → 머리 → 가까운 팔 순서. */
export function drawSide(j: Joints, muscle: Muscle): { back: string[]; body: string[]; arm: string[] } {
  const parts = new Set(MUSCLE_PARTS[muscle]);
  const ink = COLOR.ink;
  const acc = COLOR.accent;
  const back = [
    line(j.hip, j.kn2, W.far + 2, COLOR.far),
    line(j.kn2, j.an2, W.far, COLOR.far),
    line(j.an2, j.toe2, 7, COLOR.far),
    line(j.sh, j.el2, W.far, COLOR.far),
    line(j.el2, j.wr2, W.far - 1, COLOR.far),
  ];
  const body = [
    line(j.hip, j.sh, W.torso, parts.has('torso') ? acc : ink),
    parts.has('torsoUpper') ? line(j.mid, j.sh, W.torso, acc) : '',
    parts.has('torsoLower') ? line(j.hip, j.chest, W.torso - 2, acc) : '',
    parts.has('neck') ? line(j.sh, j.neck, W.torso - 4, acc) : '',
    line(j.hip, j.kn, W.leg, parts.has('thigh') ? acc : ink),
    line(j.kn, j.an, W.limb, parts.has('shin') ? acc : ink),
    line(j.an, j.toe, 8, ink),
    parts.has('glute') ? circle(j.hip, 10, acc) : '',
    circle(j.head, L.head, ink),
  ];
  const elMid: Pt = [(j.sh[0] * 0.55 + j.el[0] * 0.45), (j.sh[1] * 0.55 + j.el[1] * 0.45)];
  const arm = [
    line(j.sh, j.el, W.limb, parts.has('upperArm') ? acc : ink),
    parts.has('shoulderCap') ? line(j.sh, elMid, W.limb + 2, acc) : '',
    line(j.el, j.wr, W.limb - 1, parts.has('fore') ? acc : ink),
    circle(j.wr, 5.5, ink),
  ];
  return { back: back.filter(Boolean), body: body.filter(Boolean), arm: arm.filter(Boolean) };
}

/** 앞모습 사람. */
export function drawFront(j: Joints, muscle: Muscle): { back: string[]; body: string[]; arm: string[] } {
  const parts = new Set(MUSCLE_PARTS[muscle]);
  const ink = COLOR.ink;
  const acc = COLOR.accent;
  const hr: Pt = [j.hip[0] + FRONT.hipW, j.hip[1]];
  const hl: Pt = [j.hip[0] - FRONT.hipW, j.hip[1]];
  const sl = j.sh;
  const sr2: Pt = j.sh2;
  const torsoPts: Pt[] = [hl, sr2, sl, hr];
  const torsoFill = parts.has('torso') || parts.has('torsoUpper') ? acc : ink;
  const body: string[] = [
    // 몸통 = 사다리꼴(어깨가 넓다) — 둥근 모서리로 칠한다
    `<polygon points="${torsoPts.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')}" fill="${torsoFill}" stroke="${torsoFill}" stroke-width="12" stroke-linejoin="round"/>`,
  ];
  if (parts.has('torsoLower') && !parts.has('torso')) {
    const midL: Pt = [(hl[0] + sr2[0]) / 2, (hl[1] + sr2[1]) / 2];
    const midR: Pt = [(hr[0] + sl[0]) / 2, (hr[1] + sl[1]) / 2];
    body.push(
      `<polygon points="${[hl, midL, midR, hr].map((p) => `${f(p[0])},${f(p[1])}`).join(' ')}" fill="${acc}" stroke="${acc}" stroke-width="10" stroke-linejoin="round"/>`,
    );
  }
  if (parts.has('torsoUpper') && !parts.has('torso')) {
    // 위 몸통만 — 아랫부분을 잉크로 덧칠해 가슴만 남긴다
    const midL: Pt = [(hl[0] + sr2[0]) / 2, (hl[1] + sr2[1]) / 2];
    const midR: Pt = [(hr[0] + sl[0]) / 2, (hr[1] + sl[1]) / 2];
    body.push(
      `<polygon points="${[hl, midL, midR, hr].map((p) => `${f(p[0])},${f(p[1])}`).join(' ')}" fill="${ink}" stroke="${ink}" stroke-width="12" stroke-linejoin="round"/>`,
    );
  }
  if (parts.has('neck')) body.push(line(sr2, sl, 8, acc));
  const legColor = parts.has('thigh') ? acc : ink;
  body.push(
    line(hr, j.kn, W.leg, legColor),
    line(hl, j.kn2, W.leg, legColor),
    line(j.kn, j.an, W.limb, parts.has('shin') ? acc : ink),
    line(j.kn2, j.an2, W.limb, parts.has('shin') ? acc : ink),
    line(j.an, j.toe, 8, ink),
    line(j.an2, j.toe2, 8, ink),
  );
  if (parts.has('glute')) body.push(circle(hr, 8, acc), circle(hl, 8, acc));
  body.push(circle(j.head, L.head, ink));
  const upper = parts.has('upperArm') ? acc : ink;
  const capR: Pt = [(j.sh[0] * 0.55 + j.el[0] * 0.45), (j.sh[1] * 0.55 + j.el[1] * 0.45)];
  const capL: Pt = [(sr2[0] * 0.55 + j.el2[0] * 0.45), (sr2[1] * 0.55 + j.el2[1] * 0.45)];
  const arm = [
    line(j.sh, j.el, W.limb, upper),
    line(sr2, j.el2, W.limb, upper),
    parts.has('shoulderCap') ? line(j.sh, capR, W.limb + 2, acc) : '',
    parts.has('shoulderCap') ? line(sr2, capL, W.limb + 2, acc) : '',
    line(j.el, j.wr, W.limb - 1, parts.has('fore') ? acc : ink),
    line(j.el2, j.wr2, W.limb - 1, parts.has('fore') ? acc : ink),
    circle(j.wr, 5.5, ink),
    circle(j.wr2, 5.5, ink),
  ];
  return { back: [], body, arm: arm.filter(Boolean) };
}

// ── 기구 부품 ───────────────────────────────────────────────────────────────

/** 옆모습 바벨 — 원판 원 + 가운데 봉. */
export function barbellSide(c: Pt, r = 20): string {
  return circle(c, r, 'none', COLOR.equip, 6) + circle(c, 4, COLOR.equip);
}

/** 앞모습 바벨 — 가로 봉 + 양끝 원판. */
export function barbellFront(a: Pt, b: Pt): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const ext = 34;
  const p1: Pt = [a[0] - ux * ext, a[1] - uy * ext];
  const p2: Pt = [b[0] + ux * ext, b[1] + uy * ext];
  const plate = (p: Pt) => line([p[0] - uy * 18, p[1] + ux * 18], [p[0] + uy * 18, p[1] - ux * 18], 9, COLOR.equip);
  const in1: Pt = [p1[0] + ux * 8, p1[1] + uy * 8];
  const in2: Pt = [p2[0] - ux * 8, p2[1] - uy * 8];
  return line(p1, p2, 4, COLOR.equip) + plate(in1) + plate(in2);
}

/** 덤벨 — 손 중심의 짧은 봉 + 양끝 덩이. angle = 봉 방향. */
export function dumbbell(c: Pt, angle = 0): string {
  const a = (angle * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const e1: Pt = [c[0] - ux * 11, c[1] - uy * 11];
  const e2: Pt = [c[0] + ux * 11, c[1] + uy * 11];
  const head = (p: Pt) => line([p[0] - uy * 7, p[1] + ux * 7], [p[0] + uy * 7, p[1] - ux * 7], 7, COLOR.equip);
  return line(e1, e2, 4, COLOR.equip) + head(e1) + head(e2);
}

/** 케틀벨 — 손 아래로 매달린 공 + 손잡이. */
export function kettlebell(c: Pt, down = true): string {
  const s = down ? 1 : -1;
  const ball: Pt = [c[0], c[1] + s * 13];
  return circle(ball, 9, COLOR.equip) + `<path d="M${f(c[0] - 6)},${f(c[1] + s * 6)} Q${f(c[0])},${f(c[1] - s * 6)} ${f(c[0] + 6)},${f(c[1] + s * 6)}" fill="none" stroke="${COLOR.equip}" stroke-width="3"/>`;
}

/** EZ 바 — 옆모습은 작은 원판 + 꺾인 손잡이 표시. */
export function ezbarSide(c: Pt): string {
  return circle(c, 15, 'none', COLOR.equip, 5) + circle(c, 3.5, COLOR.equip);
}

/** 트랩바 — 원판 + 육각 틀. */
export function trapbarSide(c: Pt): string {
  return circle(c, 20, 'none', COLOR.equip, 6) + line([c[0] - 18, c[1] - 6], [c[0] + 18, c[1] - 6], 3, COLOR.equip);
}

/** 케이블 기둥 + 도르래 — 도르래 위치 p, 기둥 x. */
export function cableColumn(x: number, top = 16, bottom = GROUND_Y): string {
  return rect(x - 6, top, 12, bottom - top, COLOR.soft, 4);
}

export function pulley(p: Pt): string {
  return circle(p, 6, 'none', COLOR.equip, 3);
}

/** 케이블 줄 — 도르래 → 손. */
export function cableLine(from: Pt, to: Pt): string {
  return line(from, to, 2.5, COLOR.equip) + circle(to, 3.5, COLOR.equip);
}

/** 밴드 — 살짝 휜 띠. */
export function band(from: Pt, to: Pt): string {
  const mx = (from[0] + to[0]) / 2 + 4;
  const my = (from[1] + to[1]) / 2 + 6;
  return `<path d="M${f(from[0])},${f(from[1])} Q${f(mx)},${f(my)} ${f(to[0])},${f(to[1])}" fill="none" stroke="${COLOR.accent}" stroke-opacity="0.55" stroke-width="4" stroke-linecap="round"/>`;
}

/** 스미스 레일 — 세로 기둥 두 줄(봉이 레일을 따라 움직인다). */
export function smithRails(x: number): string {
  return rect(x - 16, 14, 6, GROUND_Y - 14, COLOR.soft, 3) + rect(x + 10, 14, 6, GROUND_Y - 14, COLOR.soft, 3);
}

/** 웨이트 스택 — 머신 뒤 판 더미. */
export function weightStack(x: number, top: number, bottom = GROUND_Y): string {
  const out = [rect(x, top, 22, bottom - top, COLOR.soft, 3)];
  for (let y = bottom - 10; y > bottom - 60; y -= 8) out.push(line([x + 3, y], [x + 19, y], 2, COLOR.equip));
  return out.join('');
}

/** 벤치 — 윗면 두 점 + 다리. */
export function bench(a: Pt, b: Pt, legs = true): string {
  const out = [slab(a, b, 9)];
  if (legs) {
    const lx1 = a[0] + (b[0] - a[0]) * 0.15;
    const ly1 = a[1] + (b[1] - a[1]) * 0.15;
    const lx2 = a[0] + (b[0] - a[0]) * 0.85;
    const ly2 = a[1] + (b[1] - a[1]) * 0.85;
    out.push(line([lx1, ly1 + 4], [lx1, GROUND_Y], 5, COLOR.equip), line([lx2, ly2 + 4], [lx2, GROUND_Y], 5, COLOR.equip));
  }
  return out.join('');
}

/** 바닥선. */
export function ground(): string {
  return line([-300, GROUND_Y + 2], [540, GROUND_Y + 2], 2, COLOR.soft);
}

/** 철봉 — 가로 막대(옆에서 보면 점, 앞에서 보면 선). */
export function pullBarSide(c: Pt): string {
  // 옆에서 본 철봉 — 양옆 기둥 끝에 걸친 짧은 가로 막대로 그려 "매달린다"가 읽히게
  return (
    line([c[0] - 34, c[1] - 26], [c[0] - 34, c[1]], 3, COLOR.soft) +
    line([c[0] + 34, c[1] - 26], [c[0] + 34, c[1]], 3, COLOR.soft) +
    line([c[0] - 34, c[1]], [c[0] + 34, c[1]], 5, COLOR.equip)
  );
}

export function pullBarFront(y: number, x1 = 40, x2 = 200): string {
  return line([x1, y], [x2, y], 5, COLOR.equip) + line([x1, y], [x1, 6], 3, COLOR.soft) + line([x2, y], [x2, 6], 3, COLOR.soft);
}

/** 원판(손에 든 플레이트) — 옆모습 원. */
export function plateHeld(c: Pt, r = 15): string {
  return circle(c, r, 'none', COLOR.equip, 5);
}

/** 메디신볼·월볼 */
export function ball(c: Pt, r = 12): string {
  return circle(c, r, COLOR.equip);
}
