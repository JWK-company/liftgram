// @plm SRS-055  픽토그램 자세 데이터 — 동작 원형(archetype)마다 시작·끝 자세와 장면(벤치·머신·케이블 고정점).
//
// 종목 그림 = family → 원형(render.ts 의 FAMILY_ARCH) + 그 종목의 기구 + 주동근 강조.
// 여기에는 **숫자만** 있다(관절 절대각 · 기준 관절 좌표). 그리는 규칙은 rig.ts.
//
// 좌표: 240×200, 바닥 y=188. 서 있는 사람의 발목은 y=181. 옆모습은 오른쪽을 본다.
// 각도: 0 = 오른쪽, 90 = 아래, -90 = 위, 180 = 왼쪽.
import type { Equip, FrontPose, Joint, Pose, Pt, SidePose } from './rig';

/** 장면 원소 — 좌표 또는 관절 이름(움직임을 따라간다). */
export type P = Pt | Joint;

export type Item =
  | { k: 'bench'; a: Pt; b: Pt; legs?: boolean }
  | { k: 'pad'; a: P; b: P; w?: number; off?: number }
  | { k: 'stack'; x: number; top: number }
  | { k: 'column'; x: number; top?: number }
  | { k: 'lever'; pivot: Pt; to: P; w?: number }
  | { k: 'bar'; at: Pt }
  | { k: 'barF'; y: number; x1?: number; x2?: number }
  | { k: 'box'; x: number; y: number; w: number; h: number }
  | { k: 'plate'; at: P; r?: number }
  | { k: 'ball'; at: P; r?: number }
  | { k: 'line'; a: P; b: P; w?: number }
  | { k: 'wheel'; at: Pt; r: number }
  | { k: 'dbl'; at: P; ang?: number }
  | { k: 'kb'; at: P }
  | { k: 'barbell'; at: P }
  | { k: 'cable'; from: Pt; to: P }
  | { k: 'band'; from: P; to: P }
  | { k: 'rope'; from: P; to: Pt }
  | { k: 'loop'; cx: number; cy: number; rx: number; ry: number };

export interface Arch {
  start: Pose;
  end: Pose;
  /** 목록 썸네일에 쓸 자세(기본 end) */
  thumb?: 'start' | 'end';
  /** 늘 그리는 장면(벤치·바·박스) */
  scene?: Item[];
  /** 프리웨이트가 놓이는 관절(기본 wr). none = 손에 들지 않는다 */
  hold?: Joint | 'none';
  /** 케이블 종목 — 도르래 위치·줄이 닿는 관절(기본 wr)·기둥 x */
  cable?: { from: Pt; to?: Joint; col?: number; both?: boolean };
  /** 밴드 종목 — 고정점 */
  band?: { from: P; to?: Joint };
  /** 머신 종목의 틀(좌석·패드·스택·레버) */
  machine?: Item[];
  /** 기구가 other 인 종목의 소품(원판·공·썰매) */
  other?: Item[];
  /** 기구별로 다른 원형을 쓴다(예: 머신 체스트 프레스는 앉아서) */
  use?: Partial<Record<Equip, string>>;
}

// ── 공통 자세 조각 ──────────────────────────────────────────────────────────

const X = 120;
const AY = 181; // 서 있는 발목 y

const stand = (a: [number, number] = [90, 90], extra: Partial<SidePose> = {}): SidePose => ({
  t: -90,
  a,
  l: [90, 90, 0],
  at: ['an', X, AY],
  ...extra,
});

/** 벤치에 누운 사람(머리 왼쪽) — 엉덩이 (150,116), 발은 바닥. */
const lie = (a: [number, number], extra: Partial<SidePose> = {}): SidePose => ({
  t: 180,
  a,
  l: [45, 90, 0],
  at: ['hip', 150, 116],
  ...extra,
});
const FLAT_BENCH: Item = { k: 'bench', a: [70, 128], b: [176, 128] };

/** 앉은 사람(옆) — 엉덩이 (100,140), 좌석 위. */
const sit = (a: [number, number], extra: Partial<SidePose> = {}): SidePose => ({
  t: -90,
  a,
  l: [0, 90, 0],
  at: ['hip', 100, 140],
  ...extra,
});
const SEAT: Item = { k: 'bench', a: [78, 150], b: [128, 150] };
const BACKPAD: Item = { k: 'pad', a: [84, 146], b: [84, 70], w: 9 };

/** 앞모습 서기 — 골반 (120,106). */
const fstand = (ar: [number, number], extra: Partial<FrontPose> = {}): FrontPose => ({
  view: 'front',
  ar,
  lr: [95, 90],
  at: ['hip', X, 106],
  ...extra,
});
/** 앞모습 앉기 — 골반 (120,138). */
const fsit = (ar: [number, number], extra: Partial<FrontPose> = {}): FrontPose => ({
  view: 'front',
  ar,
  lr: [80, 92],
  seated: true,
  at: ['hip', X, 138],
  ...extra,
});

/** 엎드려 팔 편 자세(푸시업 위) — 손 (162,181). */
const pushTop = (extra: Partial<SidePose> = {}): SidePose => ({
  t: -12,
  a: [90, 90],
  l: [168, 168, 90],
  at: ['wr', 160, AY],
  ...extra,
});
const pushBottom = (extra: Partial<SidePose> = {}): SidePose => ({
  t: -4,
  a: [150, 70],
  l: [176, 176, 90],
  at: ['wr', 160, AY],
  ...extra,
});

/** 매달리기(옆) — 손이 철봉 (124,26). */
const hang = (a: [number, number], l: [number, number, number?], t = -90): SidePose => ({ t, a, l, at: ['wr', 124, 26] });

// 데드리프트 계열
const DL_BOTTOM: SidePose = { t: -32, a: [90, 90], l: [22, 104, 0], at: ['an', X, AY] };
const DL_TOP: SidePose = stand([90, 90]);
const HINGE: SidePose = { t: -12, a: [90, 90], l: [80, 98, 0], at: ['an', X, AY] };
// 스쿼트 계열
const SQ_BOTTOM_LEGS: [number, number, number] = [6, 114, 0];
const backBar: [number, number] = [118, -66];
const frontRack: [number, number] = [-10, 168];

// ── 원형 ────────────────────────────────────────────────────────────────────

export const ARCH: Record<string, Arch> = {
  // ── 가슴: 누워서 밀기 ──
  bench_press: {
    start: lie([-90, -90]),
    end: lie([28, -92]),
    scene: [FLAT_BENCH],
    cable: { from: [112, 184], col: 112 },
    use: { machine: 'chest_press' },
  },
  incline_press: {
    start: { t: 208, a: [-82, -82], l: [25, 92, 0], at: ['hip', 150, 128] },
    end: { t: 208, a: [40, -80], l: [25, 92, 0], at: ['hip', 150, 128] },
    scene: [
      { k: 'pad', a: [146, 141], b: [94, 113], w: 9 },
      { k: 'bench', a: [134, 140], b: [176, 140] },
    ],
    cable: { from: [126, 184], col: 126 },
    use: { machine: 'incline_chest_press' },
  },
  decline_press: {
    start: { t: 166, a: [-95, -95], l: [-10, 70, 0], at: ['hip', 150, 112] },
    end: { t: 166, a: [22, -100], l: [-10, 70, 0], at: ['hip', 150, 112] },
    scene: [{ k: 'pad', a: [86, 136], b: [164, 117], w: 9 }, { k: 'line', a: [130, 124], b: [130, 188], w: 5 }],
    use: { machine: 'chest_press' },
  },
  floor_press: {
    start: { t: 180, a: [-90, -90], l: [-45, 70, 0], at: ['hip', 150, 176] },
    end: { t: 180, a: [80, -90], l: [-45, 70, 0], at: ['hip', 150, 176] },
  },
  chest_press: {
    start: sit([5, 0], { t: -95 }),
    end: sit([110, -20], { t: -95 }),
    scene: [SEAT, BACKPAD],
    machine: [{ k: 'stack', x: 196, top: 60 }, { k: 'lever', pivot: [176, 52], to: 'wr', w: 6 }],
    cable: { from: [190, 80], col: 196 },
  },
  incline_chest_press: {
    start: sit([-30, -35], { t: -100 }),
    end: sit([90, -60], { t: -100 }),
    scene: [SEAT, BACKPAD],
    machine: [{ k: 'stack', x: 196, top: 60 }, { k: 'lever', pivot: [190, 120], to: 'wr', w: 6 }],
  },
  fly_lying: {
    // 위에서 내려다본 벤치 위 사람 — 팔을 모았다가 활짝 편다
    start: { view: 'front', ar: [34, 152], lr: [92, 90], at: ['hip', X, 118] },
    end: { view: 'front', ar: [-4, 6], lr: [92, 90], at: ['hip', X, 118] },
    thumb: 'end',
    scene: [{ k: 'pad', a: [X, 22], b: [X, 150], w: 46 }],
    use: { machine: 'pec_deck', cable: 'cable_crossover' },
  },
  incline_fly: {
    start: { view: 'front', ar: [20, 156], lr: [92, 90], at: ['hip', X, 118] },
    end: { view: 'front', ar: [-14, -4], lr: [92, 90], at: ['hip', X, 118] },
    scene: [{ k: 'pad', a: [X, 22], b: [X, 150], w: 46 }],
    use: { cable: 'cable_crossover' },
  },
  pec_deck: {
    start: fsit([0, -60]),
    end: fsit([-10, 200]),
    machine: [{ k: 'pad', a: [X, 72], b: [X, 136], w: 34 }],
    scene: [{ k: 'pad', a: [X, 72], b: [X, 136], w: 34 }],
  },
  cable_crossover: {
    start: fstand([-30, -15]),
    end: fstand([105, 150]),
    cable: { from: [28, 28], col: 22, both: true },
  },
  low_to_high_fly: {
    start: fstand([75, 80]),
    end: fstand([-30, -150]),
    cable: { from: [28, 176], col: 22, both: true },
  },
  push_up: { start: pushTop(), end: pushBottom() },
  push_up_incline: {
    start: { t: -30, a: [92, 92], l: [150, 150, 90], at: ['wr', 160, 132] },
    end: { t: -24, a: [148, 60], l: [156, 156, 90], at: ['wr', 160, 132] },
    scene: [{ k: 'box', x: 148, y: 136, w: 40, h: 52 }],
  },
  push_up_decline: {
    start: { t: 8, a: [86, 86], l: [190, 190, 90], at: ['wr', 162, AY] },
    end: { t: 14, a: [150, 70], l: [194, 194, 90], at: ['wr', 162, AY] },
    scene: [{ k: 'box', x: 22, y: 140, w: 44, h: 48 }],
  },
  knee_push_up: {
    start: { t: -22, a: [90, 90], l: [160, 90, 180], at: ['wr', 160, AY] },
    end: { t: -8, a: [150, 70], l: [168, 100, 180], at: ['wr', 160, AY] },
  },
  dips: {
    start: { t: -86, a: [94, 92], l: [100, 150, 90], at: ['wr', 128, 104] },
    end: { t: -72, a: [150, 40], l: [104, 150, 90], at: ['wr', 128, 104] },
    scene: [{ k: 'line', a: [128, 108], b: [128, 188], w: 5 }, { k: 'line', a: [112, 108], b: [146, 108], w: 6 }],
    use: { machine: 'assisted_dip' },
  },

  // ── 등 ──
  deadlift: { start: DL_BOTTOM, end: DL_TOP, thumb: 'start', band: { from: 'an', to: 'wr' } },
  rack_pull: {
    start: { t: -52, a: [90, 90], l: [62, 104, 0], at: ['an', X, AY] },
    end: DL_TOP,
    thumb: 'start',
    scene: [{ k: 'line', a: [146, 122], b: [146, 188], w: 5 }],
  },
  romanian_deadlift: { start: DL_TOP, end: HINGE, cable: { from: [150, 184], col: 156 } },
  stiff_leg: { start: DL_TOP, end: { t: -6, a: [90, 90], l: [86, 92, 0], at: ['an', X, AY] } },
  good_morning: {
    start: stand(backBar),
    end: { t: -8, a: [140, -40], l: [82, 98, 0], at: ['an', X, AY] },
    hold: 'sh',
    band: { from: 'an', to: 'sh' },
  },
  bent_over_row: {
    start: { t: -24, a: [90, 90], l: [78, 100, 0], at: ['an', X, AY] },
    end: { t: -24, a: [168, 80], l: [78, 100, 0], at: ['an', X, AY] },
  },
  pendlay_row: {
    start: { t: -4, a: [90, 90], l: [72, 108, 0], at: ['an', X, AY] },
    end: { t: -4, a: [172, 80], l: [72, 108, 0], at: ['an', X, AY] },
  },
  t_bar_row: {
    start: { t: -30, a: [92, 92], l: [76, 104, 0], at: ['an', 100, AY] },
    end: { t: -30, a: [160, 82], l: [76, 104, 0], at: ['an', 100, AY] },
    scene: [{ k: 'lever', pivot: [214, 186], to: 'wr', w: 5 }],
    hold: 'wr',
  },
  chest_supported_t_bar: {
    start: { t: -36, a: [92, 92], l: [50, 120, 0], at: ['an', 100, AY] },
    end: { t: -36, a: [160, 82], l: [50, 120, 0], at: ['an', 100, AY] },
    scene: [{ k: 'pad', a: [96, 132], b: [150, 96], w: 9 }, { k: 'line', a: [120, 120], b: [120, 188], w: 5 }],
  },
  one_arm_row: {
    start: { t: -6, a: [90, 90], a2: [74, 106], l: [100, 86, 0], l2: [74, 180, 0], at: ['hip', 110, 106] },
    end: { t: -6, a: [168, 78], a2: [74, 106], l: [100, 86, 0], l2: [74, 180, 0], at: ['hip', 110, 106] },
    scene: [{ k: 'bench', a: [88, 152], b: [182, 152] }],
  },
  chest_supported_row: {
    start: { t: -42, a: [94, 94], l: [40, 100, 0], at: ['an', 96, AY] },
    end: { t: -42, a: [168, 70], l: [40, 100, 0], at: ['an', 96, AY] },
    scene: [{ k: 'pad', a: [104, 136], b: [158, 88], w: 9 }],
    machine: [{ k: 'stack', x: 200, top: 70 }, { k: 'lever', pivot: [200, 72], to: 'wr', w: 5 }],
  },
  seal_row: {
    start: { t: 0, a: [90, 90], l: [180, 180, 90], at: ['hip', 80, 112] },
    end: { t: 0, a: [176, 82], l: [180, 180, 90], at: ['hip', 80, 112] },
    scene: [{ k: 'bench', a: [36, 124], b: [154, 124] }],
  },
  seated_row: {
    start: { t: -68, a: [4, 4], l: [2, 14, -80], at: ['hip', 92, 146] },
    end: { t: -96, a: [118, -6], l: [6, 22, -80], at: ['hip', 92, 146] },
    scene: [{ k: 'bench', a: [64, 154], b: [124, 154] }, { k: 'pad', a: [176, 132], b: [176, 168], w: 6 }],
    cable: { from: [204, 140], col: 212 },
    machine: [{ k: 'stack', x: 200, top: 64 }, { k: 'pad', a: [140, 84], b: [140, 124], w: 8 }, { k: 'lever', pivot: [196, 66], to: 'wr', w: 5 }],
    band: { from: 'toe', to: 'wr' },
  },
  lat_pulldown: {
    start: fsit([-62, -78]),
    end: fsit([38, -98]),
    thumb: 'end',
    scene: [{ k: 'pad', a: [94, 146], b: [146, 146], w: 8 }],
    cable: { from: [X, 10], col: X },
    machine: [{ k: 'lever', pivot: [X, 14], to: 'wr', w: 5 }, { k: 'lever', pivot: [X, 14], to: 'wr2', w: 5 }],
  },
  straight_arm_pulldown: {
    start: { t: -70, a: [-40, -40], l: [84, 96, 0], at: ['an', 100, AY] },
    end: { t: -70, a: [84, 84], l: [84, 96, 0], at: ['an', 100, AY] },
    cable: { from: [200, 30], col: 210 },
    band: { from: [210, 30] },
  },
  pull_up: {
    start: { view: 'front', ar: [-66, -82], lr: [96, 100], at: ['wr', 156, 30] },
    end: { view: 'front', ar: [34, -100], lr: [96, 110], at: ['wr', 156, 30] },
    thumb: 'end',
    scene: [{ k: 'barF', y: 30 }],
    use: { machine: 'assisted_pull' },
  },
  chin_up: {
    start: hang([-90, -90], [94, 120, 80]),
    end: hang([60, -92], [94, 120, 80]),
    thumb: 'end',
    scene: [{ k: 'bar', at: [124, 26] }],
  },
  assisted_pull: {
    start: { view: 'front', ar: [-66, -82], lr: [100, 92], at: ['wr', 156, 30] },
    end: { view: 'front', ar: [34, -100], lr: [100, 92], at: ['wr', 156, 30] },
    scene: [{ k: 'barF', y: 30 }],
    machine: [{ k: 'pad', a: 'kn', b: 'kn2', w: 7, off: -6 }, { k: 'stack', x: 196, top: 70 }],
  },
  assisted_dip: {
    start: { t: -86, a: [94, 92], l: [100, 150, 90], at: ['wr', 128, 104] },
    end: { t: -72, a: [150, 40], l: [104, 150, 90], at: ['wr', 128, 104] },
    scene: [{ k: 'line', a: [128, 108], b: [128, 188], w: 5 }, { k: 'line', a: [112, 108], b: [146, 108], w: 6 }],
    machine: [{ k: 'pad', a: 'kn', b: [150, 150], w: 7 }, { k: 'stack', x: 196, top: 70 }],
  },
  inverted_row: {
    start: { t: -170, a: [-90, -90], l: [8, 8, -80], at: ['wr', 112, 96] },
    end: { t: -164, a: [-150, -80], l: [12, 12, -80], at: ['wr', 112, 96] },
    scene: [{ k: 'line', a: [112, 96], b: [112, 188], w: 5 }, { k: 'barbell', at: [112, 96] }],
    hold: 'none',
  },
  back_extension: {
    start: { t: 60, a: [100, 100], l: [182, 178, 90], at: ['hip', 110, 104] },
    end: { t: -10, a: [100, 100], l: [182, 178, 90], at: ['hip', 110, 104] },
    scene: [{ k: 'pad', a: [104, 114], b: [130, 114], w: 9 }, { k: 'line', a: [118, 118], b: [100, 188], w: 5 }, { k: 'pad', a: [56, 112], b: [56, 124], w: 8 }],
    hold: 'none',
  },
  reverse_hyper: {
    start: { t: 0, a: [100, 100], l: [100, 92, 0], at: ['hip', 100, 110] },
    end: { t: 0, a: [100, 100], l: [182, 180, 0], at: ['hip', 100, 110] },
    scene: [{ k: 'pad', a: [104, 120], b: [168, 120], w: 9 }, { k: 'line', a: [140, 124], b: [140, 188], w: 5 }],
  },
  superman: {
    start: { t: 0, a: [10, 0], l: [180, 180, 90], at: ['hip', 100, 176] },
    end: { t: -12, a: [-14, -14], l: [172, 172, 90], at: ['hip', 100, 176] },
    hold: 'none',
  },
  pullover: {
    start: lie([-90, -90]),
    end: lie([-170, -170]),
    scene: [FLAT_BENCH],
    machine: [{ k: 'pad', a: [92, 60], b: [92, 120], w: 8 }],
  },
  high_row: {
    start: sit([-40, -40], { t: -94 }),
    end: sit([140, -60], { t: -94 }),
    scene: [SEAT, { k: 'pad', a: [134, 96], b: [134, 130], w: 8 }],
    machine: [{ k: 'stack', x: 200, top: 50 }, { k: 'lever', pivot: [200, 40], to: 'wr', w: 5 }],
    cable: { from: [196, 24], col: 204 },
  },
  low_row: {
    start: sit([20, 20], { t: -96 }),
    end: sit([150, 10], { t: -96 }),
    scene: [SEAT, { k: 'pad', a: [134, 96], b: [134, 130], w: 8 }],
    machine: [{ k: 'stack', x: 200, top: 70 }, { k: 'lever', pivot: [200, 160], to: 'wr', w: 5 }],
  },

  // ── 어깨 ──
  overhead_press: {
    start: stand([78, -84]),
    end: stand([-86, -90]),
    cable: { from: [100, 184], col: 92 },
    band: { from: 'an', to: 'wr' },
    use: { machine: 'shoulder_press_machine' },
  },
  shoulder_press_machine: {
    start: sit([80, -84], { t: -92 }),
    end: sit([-88, -92], { t: -92 }),
    scene: [SEAT, BACKPAD],
    machine: [{ k: 'stack', x: 196, top: 50 }, { k: 'lever', pivot: [62, 150], to: 'wr', w: 5 }],
  },
  seated_press: {
    start: sit([78, -84], { t: -92 }),
    end: sit([-86, -90], { t: -92 }),
    scene: [SEAT, BACKPAD],
  },
  behind_neck_press: {
    start: stand([110, -70]),
    end: stand([-94, -90]),
  },
  push_press: {
    start: { t: -86, a: [78, -84], l: [62, 116, 0], at: ['an', X, AY] },
    end: stand([-86, -90]),
  },
  lateral_raise: {
    start: fstand([96, 94]),
    end: fstand([2, 4]),
    cable: { from: [28, 176], col: 22 },
    band: { from: 'an2' },
    use: { machine: 'lateral_raise_machine' },
  },
  lateral_raise_machine: {
    start: fsit([94, 70]),
    end: fsit([4, -40]),
    machine: [{ k: 'pad', a: [X, 70], b: [X, 136], w: 30 }],
  },
  front_raise: {
    start: stand([90, 90]),
    end: stand([-6, -6]),
    cable: { from: [96, 184], col: 88 },
    band: { from: 'an', to: 'wr' },
    other: [],
  },
  y_raise: {
    start: fstand([96, 94]),
    end: fstand([-56, -58]),
    cable: { from: [28, 176], col: 22, both: true },
  },
  rear_delt_fly: {
    start: fstand([110, 130], { tilt: 0 }),
    end: fstand([-6, -2]),
    cable: { from: [28, 40], col: 22, both: true },
    use: { machine: 'reverse_pec_deck' },
  },
  reverse_pec_deck: {
    start: fsit([20, 160]),
    end: fsit([-4, -2]),
    scene: [{ k: 'pad', a: [X, 72], b: [X, 136], w: 34 }],
  },
  face_pull: {
    start: stand([-14, -14]),
    end: stand([194, -40]),
    cable: { from: [210, 34], col: 218 },
    band: { from: [216, 40] },
  },
  upright_row: {
    start: fstand([98, 96]),
    end: fstand([-26, 128]),
    cable: { from: [X, 186], col: X },
  },
  shrug: {
    start: fstand([92, 92]),
    end: fstand([92, 92], { shrug: 9 }),
    thumb: 'end',
    machine: [{ k: 'stack', x: 196, top: 50 }],
  },
  landmine_press: {
    start: { t: -84, a: [70, -90], l: [74, 104, 0], l2: [104, 92, 0], at: ['an', X, AY] },
    end: { t: -76, a: [-36, -36], l: [74, 104, 0], l2: [104, 92, 0], at: ['an', X, AY] },
    scene: [{ k: 'lever', pivot: [24, 186], to: 'wr', w: 5 }],
    hold: 'none',
  },
  pull_apart: {
    start: fstand([24, 150]),
    end: fstand([0, 2]),
    band: { from: 'wr2', to: 'wr' },
  },
  external_rotation: {
    start: fstand([90, 172]),
    end: fstand([90, -2]),
    cable: { from: [216, 120], col: 222 },
  },
  internal_rotation: {
    start: fstand([90, -2]),
    end: fstand([90, 172]),
    cable: { from: [216, 120], col: 222 },
  },
  halo: {
    start: stand([-60, -150]),
    end: stand([-110, -20]),
  },

  // ── 팔 ──
  curl: {
    start: stand([92, 90]),
    end: stand([84, -64]),
    cable: { from: [140, 184], col: 146 },
    band: { from: 'an', to: 'wr' },
    use: { machine: 'preacher_curl' },
  },
  incline_curl: {
    start: { t: -124, a: [100, 98], l: [20, 94, 0], at: ['hip', 130, 140] },
    end: { t: -124, a: [100, -40], l: [20, 94, 0], at: ['hip', 130, 140] },
    scene: [{ k: 'pad', a: [134, 150], b: [94, 92], w: 9 }, { k: 'bench', a: [118, 150], b: [168, 150] }],
  },
  preacher_curl: {
    start: sit([40, 52], { t: -96 }),
    end: sit([40, -82], { t: -96 }),
    scene: [SEAT, { k: 'pad', a: [116, 96], b: [138, 120], w: 9 }, { k: 'line', a: [140, 124], b: [140, 188], w: 5 }],
  },
  concentration_curl: {
    start: { t: -50, a: [96, 94], l: [-6, 96, 0], at: ['hip', 96, 140] },
    end: { t: -50, a: [96, -70], l: [-6, 96, 0], at: ['hip', 96, 140] },
    scene: [SEAT],
  },
  spider_curl: {
    start: { t: -40, a: [92, 92], l: [40, 104, 0], at: ['an', 96, AY] },
    end: { t: -40, a: [92, -30], l: [40, 104, 0], at: ['an', 96, AY] },
    scene: [{ k: 'pad', a: [104, 136], b: [156, 92], w: 9 }],
  },
  drag_curl: {
    start: stand([92, 90]),
    end: stand([150, -70]),
  },
  overhead_cable_curl: {
    start: fstand([-6, -4]),
    end: fstand([-6, -100]),
    cable: { from: [28, 40], col: 22, both: true },
  },
  pushdown: {
    start: stand([96, -48]),
    end: stand([94, 86]),
    cable: { from: [170, 26], col: 178 },
    band: { from: [176, 26] },
  },
  overhead_ext: {
    start: stand([-104, 112]),
    end: stand([-100, -96]),
    cable: { from: [40, 176], col: 32 },
    band: { from: 'an', to: 'wr' },
    use: { machine: 'overhead_ext_machine' },
  },
  overhead_ext_machine: {
    start: sit([-104, 108], { t: -92 }),
    end: sit([-100, -96], { t: -92 }),
    scene: [SEAT, BACKPAD],
    machine: [{ k: 'stack', x: 196, top: 40 }, { k: 'lever', pivot: [100, 18], to: 'wr', w: 5 }],
  },
  arm_extension_machine: {
    start: sit([40, -60], { t: -96 }),
    end: sit([40, 44], { t: -96 }),
    scene: [SEAT, { k: 'pad', a: [116, 96], b: [138, 120], w: 9 }, { k: 'line', a: [140, 124], b: [140, 188], w: 5 }],
    machine: [{ k: 'stack', x: 196, top: 70 }],
  },
  skull_crusher: {
    start: lie([-104, -104]),
    end: lie([-104, 168]),
    scene: [FLAT_BENCH],
    cable: { from: [40, 120], col: 34 },
  },
  kickback: {
    start: { t: -20, a: [168, 92], l: [78, 100, 0], at: ['an', X, AY] },
    end: { t: -20, a: [168, 172], l: [78, 100, 0], at: ['an', X, AY] },
    cable: { from: [204, 170], col: 212 },
    band: { from: [204, 178] },
  },
  bench_dip: {
    start: { t: -86, a: [100, 100], l: [-6, 20, -80], at: ['wr', 86, 130] },
    end: { t: -80, a: [150, 50], l: [6, 50, -80], at: ['wr', 86, 130] },
    scene: [{ k: 'bench', a: [52, 136], b: [100, 136] }],
    hold: 'none',
  },
  wrist_curl: {
    start: sit([60, 10], { t: -80 }),
    end: sit([60, -20], { t: -80 }),
    scene: [SEAT],
  },
  behind_back_wrist: {
    start: stand([100, 96]),
    end: stand([100, 82]),
  },
  farmers_walk: {
    start: { t: -88, a: [90, 90], l: [70, 100, 0], l2: [112, 90, 0], at: ['hip', X, 106] },
    end: { t: -88, a: [90, 90], l: [112, 90, 0], l2: [70, 100, 0], at: ['hip', X, 106] },
  },
  overhead_carry: {
    start: { t: -88, a: [-90, -90], l: [70, 100, 0], l2: [112, 90, 0], at: ['hip', X, 106] },
    end: { t: -88, a: [-90, -90], l: [112, 90, 0], l2: [70, 100, 0], at: ['hip', X, 106] },
  },
  wrist_roller: {
    start: stand([0, 0]),
    end: stand([0, -10]),
    other: [{ k: 'line', a: 'wr', b: [148, 150], w: 2 }, { k: 'plate', at: [148, 156], r: 9 }],
  },
  plate_pinch: {
    start: stand([92, 90]),
    end: stand([92, 90]),
    other: [{ k: 'plate', at: 'wr', r: 14 }],
  },

  // ── 다리 ──
  squat: {
    start: stand(backBar),
    end: { t: -56, a: backBar, l: SQ_BOTTOM_LEGS, at: ['an', X, AY] },
    hold: 'sh',
    band: { from: 'an', to: 'sh' },
  },
  air_squat: {
    start: stand([0, 0]),
    end: { t: -58, a: [-6, -6], l: SQ_BOTTOM_LEGS, at: ['an', X, AY] },
    hold: 'none',
  },
  squat_dumbbell: {
    start: stand([92, 90]),
    end: { t: -58, a: [92, 92], l: SQ_BOTTOM_LEGS, at: ['an', X, AY] },
  },
  front_squat: {
    start: stand(frontRack),
    end: { t: -72, a: frontRack, l: SQ_BOTTOM_LEGS, at: ['an', X, AY] },
  },
  goblet_squat: {
    start: stand([62, -112]),
    end: { t: -66, a: [56, -112], l: SQ_BOTTOM_LEGS, at: ['an', X, AY] },
  },
  overhead_squat: {
    start: stand([-96, -96]),
    end: { t: -66, a: [-110, -110], l: SQ_BOTTOM_LEGS, at: ['an', X, AY] },
  },
  box_squat: {
    start: stand(backBar),
    end: { t: -50, a: backBar, l: [4, 106, 0], at: ['an', X, AY] },
    hold: 'sh',
    scene: [{ k: 'box', x: 64, y: 146, w: 40, h: 42 }],
  },
  sumo_squat: {
    start: fstand([96, 96], { lr: [74, 92] }),
    end: fstand([96, 96], { lr: [28, 100], at: ['hip', X, 132] }),
  },
  sumo_deadlift: {
    start: fstand([92, 92], { lr: [30, 104], at: ['hip', X, 136] }),
    end: fstand([94, 94], { lr: [72, 94] }),
    thumb: 'start',
  },
  hack_squat: {
    start: { t: -112, a: [118, -60], l: [62, 104, 0], at: ['an', 140, AY] },
    end: { t: -112, a: [118, -60], l: [-24, 110, 0], at: ['an', 140, AY] },
    machine: [{ k: 'pad', a: 'hip', b: 'sh', w: 8, off: 12 }, { k: 'line', a: [70, 186], b: [190, 20], w: 4 }],
    hold: 'sh',
  },
  pendulum_squat: {
    start: { t: -100, a: [118, -60], l: [80, 100, 0], at: ['an', 140, AY] },
    end: { t: -100, a: [118, -60], l: [-14, 116, 0], at: ['an', 140, AY] },
    scene: [{ k: 'lever', pivot: [60, 20], to: 'sh', w: 5 }],
    hold: 'none',
  },
  belt_squat: {
    start: stand([0, 0]),
    end: { t: -76, a: [0, 0], l: SQ_BOTTOM_LEGS, at: ['an', X, AY] },
    scene: [{ k: 'line', a: 'hip', b: [118, 186], w: 2.5 }, { k: 'stack', x: 190, top: 120 }],
    hold: 'none',
  },
  leg_press: {
    start: { t: -152, a: [60, 20], l: [-70, 20, -60], at: ['hip', 80, 150] },
    end: { t: -152, a: [60, 20], l: [-38, -38, -120], at: ['hip', 80, 150] },
    thumb: 'start',
    scene: [{ k: 'pad', a: [86, 160], b: [36, 132], w: 9 }],
    machine: [{ k: 'pad', a: 'an', b: 'toe', w: 8, off: 7 }, { k: 'line', a: [100, 186], b: [214, 40], w: 4 }],
    hold: 'none',
  },
  seated_leg_press: {
    start: sit([20, 20], { l: [-30, 60, -90] }),
    end: sit([20, 20], { l: [0, 4, -90] }),
    scene: [SEAT, BACKPAD],
    machine: [{ k: 'pad', a: [178, 112], b: [178, 168], w: 8 }],
    hold: 'none',
  },
  v_squat: {
    start: { t: -98, a: [118, -60], l: [84, 98, 0], at: ['an', X, AY] },
    end: { t: -98, a: [118, -60], l: [-10, 112, 0], at: ['an', X, AY] },
    machine: [{ k: 'pad', a: [94, 60], b: [94, 120], w: 8 }],
    hold: 'none',
  },
  leg_extension: {
    start: sit([60, 20], { l: [0, 100, 0], t: -98 }),
    end: sit([60, 20], { l: [0, -4, 0], t: -98 }),
    scene: [SEAT, BACKPAD],
    machine: [{ k: 'pad', a: 'an', b: 'an', w: 12 }, { k: 'lever', pivot: [138, 140], to: 'an', w: 5 }],
    hold: 'none',
  },
  lying_leg_curl: {
    start: { t: 0, a: [120, 70], l: [180, 180, 90], at: ['hip', 110, 116] },
    end: { t: 0, a: [120, 70], l: [180, -80, 90], at: ['hip', 110, 116] },
    scene: [{ k: 'bench', a: [64, 128], b: [176, 128] }],
    machine: [{ k: 'pad', a: 'an', b: 'an', w: 12 }],
    hold: 'an',
  },
  seated_leg_curl: {
    start: sit([60, 20], { l: [0, 0, 0], t: -98 }),
    end: sit([60, 20], { l: [0, 104, 0], t: -98 }),
    scene: [SEAT, BACKPAD],
    machine: [{ k: 'pad', a: 'an', b: 'an', w: 12 }, { k: 'pad', a: [116, 128], b: [138, 128], w: 7 }],
    hold: 'none',
  },
  standing_leg_curl: {
    start: { t: -80, a: [30, 60], l: [92, 92, 0], l2: [90, 90, 0], at: ['an2', X, AY] },
    end: { t: -80, a: [30, 60], l: [100, -60, 0], l2: [90, 90, 0], at: ['an2', X, AY] },
    machine: [{ k: 'pad', a: 'an', b: 'an', w: 12 }],
    cable: { from: [190, 180], col: 198, to: 'an' },
    hold: 'none',
  },
  nordic: {
    start: { t: -90, a: [80, -100], l: [90, 180, 0], at: ['kn', 110, 180] },
    end: { t: -10, a: [-10, -10], l: [-10, 180, 0], at: ['kn', 110, 180] },
    hold: 'none',
  },
  ghr: {
    start: { t: -90, a: [80, -100], l: [90, 180, 0], at: ['kn', 110, 140] },
    end: { t: 0, a: [100, 100], l: [0, 180, 0], at: ['kn', 110, 140] },
    scene: [{ k: 'pad', a: [100, 148], b: [124, 148], w: 9 }, { k: 'line', a: [112, 152], b: [112, 188], w: 5 }],
    hold: 'none',
  },
  lunge: {
    start: { t: -90, a: [90, 90], l: [70, 104, 0], l2: [112, 100, 0], at: ['hip', 112, 106] },
    end: { t: -88, a: [90, 90], l: [0, 92, 0], l2: [104, 178, 30], at: ['an', 150, AY] },
  },
  reverse_lunge: {
    start: stand([90, 90]),
    end: { t: -88, a: [90, 90], l: [0, 92, 0], l2: [104, 178, 30], at: ['an', 150, AY] },
  },
  lunge_bar: {
    start: { t: -90, a: backBar, l: [70, 104, 0], l2: [112, 100, 0], at: ['hip', 112, 106] },
    end: { t: -88, a: backBar, l: [0, 92, 0], l2: [104, 178, 30], at: ['an', 150, AY] },
    hold: 'sh',
  },
  overhead_lunge: {
    start: { t: -90, a: [-90, -90], l: [70, 104, 0], l2: [112, 100, 0], at: ['hip', 112, 106] },
    end: { t: -88, a: [-90, -90], l: [0, 92, 0], l2: [104, 178, 30], at: ['an', 150, AY] },
  },
  bulgarian: {
    start: { t: -88, a: [90, 90], l: [64, 102, 0], l2: [104, 160, 160], at: ['an', 150, AY] },
    end: { t: -80, a: [90, 90], l: [6, 96, 0], l2: [116, 190, 160], at: ['an', 150, AY] },
    scene: [{ k: 'bench', a: [34, 140], b: [76, 140] }],
  },
  step_up: {
    start: { t: -86, a: [90, 90], l: [6, 92, 0], l2: [90, 90, 0], at: ['an2', 92, AY] },
    end: { t: -90, a: [90, 90], l: [90, 90, 0], l2: [130, 60, 0], at: ['an', 136, 135] },
    scene: [{ k: 'box', x: 120, y: 140, w: 58, h: 48 }],
  },
  lateral_lunge: {
    start: fstand([96, 96], { lr: [80, 90] }),
    end: fstand([96, 96], { lr: [4, 92], ll: [128, 128], at: ['an', 172, AY] }),
  },
  pistol: {
    start: stand([0, 0]),
    end: { t: -60, a: [-4, -4], l: [6, 114, 0], l2: [-6, -6, 0], at: ['an', X, AY] },
  },
  sissy: {
    start: stand([0, 0]),
    end: { t: -114, a: [0, 0], l: [-14, 130, 0], at: ['an', X, AY] },
  },
  wall_sit: {
    start: { t: -90, a: [90, 90], l: [0, 90, 0], at: ['hip', 92, 144] },
    end: { t: -90, a: [90, 90], l: [0, 90, 0], at: ['hip', 92, 144] },
    scene: [{ k: 'line', a: [80, 30], b: [80, 188], w: 6 }],
  },
  jump_squat: {
    start: { t: -56, a: [120, 120], l: SQ_BOTTOM_LEGS, at: ['an', X, AY] },
    end: { t: -90, a: [-80, -80], l: [92, 90, 40], at: ['an', X, 160] },
    thumb: 'end',
  },
  box_jump: {
    start: { t: -56, a: [150, 150], l: SQ_BOTTOM_LEGS, at: ['an', 80, AY] },
    end: { t: -70, a: [10, 10], l: [30, 104, 0], at: ['an', 158, 134] },
    scene: [{ k: 'box', x: 138, y: 140, w: 60, h: 48 }],
  },
  broad_jump: {
    start: { t: -40, a: [150, 150], l: SQ_BOTTOM_LEGS, at: ['an', 64, AY] },
    end: { t: -60, a: [-20, -20], l: [120, 110, 30], l2: [130, 130, 30], at: ['an', 160, 150] },
  },
  calf_raise: {
    start: { t: -90, a: [90, 90], l: [90, 90, 0], at: ['toe', 132, 175] },
    end: { t: -90, a: [90, 90], l: [90, 90, 46], at: ['toe', 132, 175] },
    scene: [{ k: 'box', x: 114, y: 180, w: 50, h: 8 }],
    machine: [{ k: 'pad', a: [100, 50], b: [140, 50], w: 8 }, { k: 'stack', x: 200, top: 60 }],
  },
  calf_raise_bar: {
    start: { t: -90, a: backBar, l: [90, 90, 0], at: ['toe', 132, 175] },
    end: { t: -90, a: backBar, l: [90, 90, 46], at: ['toe', 132, 175] },
    scene: [{ k: 'box', x: 114, y: 180, w: 50, h: 8 }],
    hold: 'sh',
  },
  seated_calf: {
    start: sit([40, 20], { l: [0, 90, 0], at: ['toe', 152, 175] }),
    end: sit([40, 20], { l: [0, 90, 46], at: ['toe', 152, 175] }),
    scene: [{ k: 'box', x: 130, y: 180, w: 40, h: 8 }, SEAT],
    hold: 'kn',
    machine: [{ k: 'pad', a: 'kn', b: 'kn', w: 14 }],
  },
  donkey_calf: {
    start: { t: -6, a: [90, 90], l: [90, 90, 0], at: ['toe', 132, 175] },
    end: { t: -6, a: [90, 90], l: [90, 90, 46], at: ['toe', 132, 175] },
    scene: [{ k: 'box', x: 114, y: 180, w: 50, h: 8 }],
    machine: [{ k: 'pad', a: 'hip', b: 'hip', w: 14 }],
    hold: 'none',
  },
  leg_press_calf: {
    start: { t: -152, a: [60, 20], l: [-38, -38, -120], at: ['hip', 80, 150] },
    end: { t: -152, a: [60, 20], l: [-38, -38, -80], at: ['hip', 80, 150] },
    scene: [{ k: 'pad', a: [86, 160], b: [36, 132], w: 9 }],
    machine: [{ k: 'line', a: [100, 186], b: [214, 40], w: 4 }],
    hold: 'none',
  },

  // ── 둔근 ──
  hip_thrust: {
    start: { t: 200, a: [8, 4], l: [-26, 96, 0], at: ['sh', 86, 144] },
    end: { t: 180, a: [2, 2], l: [0, 90, 0], at: ['sh', 86, 144] },
    scene: [{ k: 'bench', a: [28, 156], b: [92, 156] }],
    hold: 'hip',
    machine: [{ k: 'pad', a: 'hip', b: 'hip', w: 14 }],
    band: { from: 'hip', to: 'hip' },
  },
  glute_bridge: {
    start: { t: 176, a: [100, 0], l: [-36, 84, 0], at: ['an', 162, AY] },
    end: { t: 152, a: [130, 10], l: [-14, 90, 0], at: ['an', 162, AY] },
    hold: 'hip',
  },
  frog_pump: {
    start: { t: 176, a: [100, 0], l: [-60, 120, 0], at: ['hip', 128, 174] },
    end: { t: 156, a: [130, 10], l: [-40, 130, 0], at: ['hip', 128, 158] },
    hold: 'hip',
  },
  kickback_glute: {
    start: { t: -4, a: [90, 90], l: [90, 0, 90], at: ['wr', 168, AY] },
    end: { t: -4, a: [90, 90], l: [176, 200, 90], l2: [90, 0, 90], at: ['wr', 168, AY] },
    cable: { from: [24, 176], col: 18, to: 'an' },
    machine: [{ k: 'pad', a: [140, 120], b: [180, 120], w: 8 }],
    band: { from: 'an2', to: 'an' },
    hold: 'none',
  },
  hip_abduction: {
    start: fsit([92, 92], { lr: [88, 94] }),
    end: fsit([92, 92], { lr: [30, 84] }),
    machine: [{ k: 'pad', a: [X, 66], b: [X, 136], w: 34 }],
    hold: 'none',
  },
  hip_adduction: {
    start: fsit([92, 92], { lr: [30, 84] }),
    end: fsit([92, 92], { lr: [88, 94] }),
    machine: [{ k: 'pad', a: [X, 66], b: [X, 136], w: 34 }],
    hold: 'none',
  },
  abduction_standing: {
    start: fstand([90, 90], { lr: [92, 90] }),
    end: fstand([90, 90], { lr: [52, 52] }),
    cable: { from: [216, 176], col: 222, to: 'an' },
    band: { from: 'an2', to: 'an' },
    hold: 'none',
  },
  adduction_standing: {
    start: fstand([90, 90], { lr: [52, 52] }),
    end: fstand([90, 90], { lr: [100, 100] }),
    cable: { from: [216, 176], col: 222, to: 'an' },
    hold: 'none',
  },
  kb_swing: {
    start: { t: -20, a: [110, 110], l: [74, 100, 0], at: ['an', X, AY] },
    end: { t: -90, a: [-4, -4], l: [90, 90, 0], at: ['an', X, AY] },
    thumb: 'end',
  },
  pull_through: {
    start: { t: -18, a: [112, 112], l: [76, 100, 0], at: ['an', X, AY] },
    end: { t: -86, a: [80, 80], l: [90, 90, 0], at: ['an', X, AY] },
    cable: { from: [24, 176], col: 18 },
    band: { from: [24, 176] },
  },
  fire_hydrant: {
    start: { view: 'front', ar: [90, 90], lr: [90, 90], tilt: 0, at: ['hip', X, 120] },
    end: { view: 'front', ar: [90, 90], lr: [20, 90], tilt: 0, at: ['hip', X, 120] },
    hold: 'none',
  },
  clamshell: {
    start: { t: 180, a: [90, 0], l: [-40, 40, 0], at: ['hip', 130, 172] },
    end: { t: 180, a: [90, 0], l: [-80, 0, 0], l2: [-40, 40, 0], at: ['hip', 130, 172] },
    hold: 'none',
  },
  bird_dog: {
    start: { t: 0, a: [90, 90], l: [90, 180, 0], at: ['hip', 100, 140] },
    end: { t: 0, a: [-2, -2], a2: [90, 90], l: [180, 180, 0], l2: [90, 180, 0], at: ['hip', 100, 140] },
    hold: 'none',
  },
  side_leg_raise: {
    start: { view: 'front', tilt: 0, ar: [90, 90], lr: [92, 92], at: ['hip', X, 106] },
    end: { view: 'front', tilt: 0, ar: [90, 90], lr: [40, 40], at: ['hip', X, 106] },
    hold: 'none',
  },
  band_walk: {
    start: fstand([90, 90], { lr: [80, 96] }),
    end: fstand([90, 90], { lr: [70, 100], at: ['hip', 140, 108] }),
    band: { from: 'an2', to: 'an' },
  },
  copenhagen: {
    start: { t: 180, a: [92, 0], l: [8, 0, 0], at: ['el', 60, 178] },
    end: { t: 186, a: [96, 0], l: [4, 4, 0], at: ['el', 60, 178] },
    scene: [{ k: 'bench', a: [150, 148], b: [214, 148] }],
    hold: 'none',
  },

  // ── 복근 ──
  plank: {
    start: { t: -8, a: [92, 2], l: [174, 174, 90], at: ['wr', 168, 182] },
    end: { t: -8, a: [92, 2], l: [174, 174, 90], at: ['wr', 168, 182] },
    hold: 'none',
  },
  side_plank: {
    start: { t: -16, a: [92, 2], l: [166, 166, 90], at: ['wr', 168, 182] },
    end: { t: -22, a: [92, 2], l: [160, 160, 90], at: ['wr', 168, 182] },
    hold: 'none',
  },
  renegade: {
    start: pushTop({ at: ['wr2', 160, AY] }),
    end: pushTop({ a: [170, 80], a2: [90, 90], at: ['wr2', 160, AY] }),
  },
  plank_high: {
    start: pushTop({ l: [168, 168, 90] }),
    end: pushTop({ l: [168, 168, 90], a: [90, 90] }),
    hold: 'none',
  },
  mountain_climber: {
    start: pushTop({ l: [168, 168, 90], l2: [40, 150, 90] }),
    end: pushTop({ l: [40, 150, 90], l2: [168, 168, 90] }),
    hold: 'none',
  },
  crunch: {
    start: { t: 180, a: [-130, 160], l: [-40, 50, 0], at: ['hip', 116, 176] },
    end: { t: 206, a: [-110, 170], l: [-40, 50, 0], at: ['hip', 116, 176] },
    hold: 'none',
    cable: { from: [40, 30], col: 32 },
    machine: [{ k: 'pad', a: [92, 110], b: [92, 160], w: 8 }],
  },
  crunch_kneeling: {
    start: { t: -96, a: [-80, 120], l: [100, 180, 0], at: ['kn', 110, 180] },
    end: { t: -20, a: [-10, 110], l: [100, 180, 0], at: ['kn', 110, 180] },
    cable: { from: [150, 24], col: 158 },
    hold: 'none',
  },
  sit_up: {
    start: { t: 180, a: [-130, 160], l: [-40, 50, 0], at: ['hip', 116, 176] },
    end: { t: -70, a: [-20, -40], l: [-40, 50, 0], at: ['hip', 116, 176] },
    hold: 'none',
  },
  decline_sit_up: {
    start: { t: 164, a: [-120, 170], l: [-30, 40, 0], at: ['hip', 120, 128] },
    end: { t: -80, a: [-20, -40], l: [-30, 40, 0], at: ['hip', 120, 128] },
    scene: [{ k: 'pad', a: [40, 150], b: [130, 132], w: 9 }, { k: 'line', a: [110, 136], b: [110, 188], w: 5 }],
    hold: 'none',
  },
  v_sit: {
    start: { t: 180, a: [180, 180], l: [0, 0, 0], at: ['hip', 120, 176] },
    end: { t: -126, a: [-44, -44], l: [-50, -50, 0], at: ['hip', 120, 176] },
    hold: 'none',
  },
  hollow: {
    start: { t: 196, a: [196, 196], l: [-14, -14, 0], at: ['hip', 120, 176] },
    end: { t: 186, a: [186, 186], l: [-6, -6, 0], at: ['hip', 120, 176] },
    hold: 'none',
  },
  leg_raise_lying: {
    start: { t: 180, a: [180, 0], l: [-6, -6, 0], at: ['hip', 120, 178] },
    end: { t: 180, a: [180, 0], l: [-88, -88, 0], at: ['hip', 120, 178] },
    hold: 'none',
  },
  flutter: {
    start: { t: 180, a: [0, 0], l: [-14, -14, 0], l2: [-30, -30, 0], at: ['hip', 120, 178] },
    end: { t: 180, a: [0, 0], l: [-30, -30, 0], l2: [-14, -14, 0], at: ['hip', 120, 178] },
    hold: 'none',
  },
  knee_raise_lying: {
    start: { t: 180, a: [180, 0], l: [-6, -6, 0], at: ['hip', 120, 178] },
    end: { t: 180, a: [180, 0], l: [-80, 10, 0], at: ['hip', 120, 178] },
    hold: 'none',
  },
  reverse_crunch: {
    start: { t: 180, a: [0, 0], l: [-70, 10, 0], at: ['sh', 64, 178] },
    end: { t: 160, a: [0, 0], l: [-110, -10, 0], at: ['sh', 64, 178] },
    hold: 'none',
  },
  hanging_leg_raise: {
    start: hang([-90, -90], [92, 92, 30]),
    end: hang([-90, -90], [-4, -4, 0]),
    scene: [{ k: 'bar', at: [124, 26] }],
    hold: 'none',
  },
  hanging_knee_raise: {
    start: hang([-90, -90], [92, 92, 30]),
    end: hang([-90, -90], [-20, 90, 0]),
    scene: [{ k: 'bar', at: [124, 26] }],
    hold: 'none',
  },
  toes_to_bar: {
    start: hang([-90, -90], [92, 92, 30]),
    end: hang([-90, -90], [-70, -70, 0], -100),
    scene: [{ k: 'bar', at: [124, 26] }],
    hold: 'none',
  },
  captain_chair: {
    start: { t: -90, a: [10, 90], l: [92, 92, 30], at: ['el', 110, 96] },
    end: { t: -90, a: [10, 90], l: [-20, 90, 0], at: ['el', 110, 96] },
    scene: [{ k: 'pad', a: [100, 100], b: [140, 100], w: 8 }, { k: 'pad', a: [90, 50], b: [90, 120], w: 8 }],
    hold: 'none',
  },
  russian_twist: {
    start: { view: 'front', ar: [40, 150], lr: [60, 100], seated: true, tilt: -8, at: ['hip', X, 168] },
    end: { view: 'front', ar: [150, 40], al: [140, 30], lr: [60, 100], seated: true, tilt: 8, at: ['hip', X, 168] },
    hold: 'none',
  },
  rollout: {
    start: { t: -70, a: [80, 80], l: [180, 180, 0], at: ['kn', 92, 180] },
    end: { t: -6, a: [-8, -8], l: [180, 180, 0], at: ['kn', 92, 180] },
    other: [{ k: 'ball', at: 'wr', r: 8 }],
  },
  side_bend: {
    start: fstand([92, 92]),
    end: fstand([92, 92], { tilt: 18 }),
    cable: { from: [216, 176], col: 222 },
    hold: 'wr',
  },
  woodchop: {
    start: fstand([-40, -40], { al: [-80, -60] }),
    end: fstand([120, 130], { al: [100, 110], tilt: -6 }),
    cable: { from: [210, 24], col: 218 },
    band: { from: [210, 24] },
  },
  pallof: {
    start: stand([80, -150]),
    end: stand([0, 0]),
    cable: { from: [40, 96], col: 32 },
    band: { from: [40, 96] },
  },
  dead_bug: {
    start: { t: 180, a: [-90, -90], l: [-90, 0, 0], at: ['hip', 120, 178] },
    end: { t: 180, a: [-160, -160], a2: [-90, -90], l: [-90, 0, 0], l2: [-8, -8, 0], at: ['hip', 120, 178] },
    hold: 'none',
  },
  dragon_flag: {
    start: { t: 180, a: [-140, 20], l: [-60, -60, 0], at: ['sh', 70, 128] },
    end: { t: 180, a: [-140, 20], l: [-10, -10, 0], at: ['sh', 70, 128] },
    scene: [FLAT_BENCH],
    hold: 'none',
  },
  l_sit: {
    start: { t: -90, a: [90, 90], l: [0, 0, 0], at: ['wr', 100, 176] },
    end: { t: -90, a: [90, 90], l: [-4, -4, 0], at: ['wr', 100, 172] },
    hold: 'none',
  },
  bicycle: {
    start: { t: 206, a: [-110, 170], l: [-80, 10, 0], l2: [-10, -10, 0], at: ['hip', 120, 178] },
    end: { t: 206, a: [-110, 170], l: [-10, -10, 0], l2: [-80, 10, 0], at: ['hip', 120, 178] },
    hold: 'none',
  },
  toe_touch: {
    start: { t: 180, a: [-90, -90], l: [-90, -90, 0], at: ['hip', 120, 178] },
    end: { t: 220, a: [-60, -60], l: [-90, -90, 0], at: ['hip', 120, 178] },
    hold: 'none',
  },
  torso_rotation: {
    start: fsit([30, 150], { tilt: -6 }),
    end: fsit([150, 30], { al: [140, 30], tilt: 6 }),
    machine: [{ k: 'pad', a: [X, 66], b: [X, 136], w: 30 }],
    hold: 'none',
  },
  landmine_180: {
    start: fstand([-40, -40], { al: [-70, -60] }),
    end: fstand([-120, -130], { al: [-140, -150] }),
    hold: 'none',
    scene: [{ k: 'lever', pivot: [X, 186], to: 'wr', w: 5 }],
  },
  windmill: {
    start: fstand([-90, -90], { al: [96, 96] }),
    end: fstand([-90, -90], { al: [96, 96], tilt: -40 }),
  },

  // ── 전신 ──
  clean: { start: DL_BOTTOM, end: stand(frontRack), thumb: 'end' },
  clean_jerk: { start: stand(frontRack), end: { t: -90, a: [-90, -90], l: [70, 104, 0], l2: [116, 96, 0], at: ['hip', X, 108] } },
  snatch: { start: DL_BOTTOM, end: { t: -66, a: [-110, -110], l: SQ_BOTTOM_LEGS, at: ['an', X, AY] }, thumb: 'end' },
  thruster: { start: { t: -72, a: frontRack, l: SQ_BOTTOM_LEGS, at: ['an', X, AY] }, end: stand([-88, -90]) },
  high_pull: { start: DL_BOTTOM, end: stand([186, -30]) },
  burpee: { start: pushTop(), end: { t: -90, a: [-90, -90], l: [92, 90, 40], at: ['an', X, 166] }, hold: 'none' },
  battle_rope: {
    start: { t: -70, a: [40, -10], l: [40, 110, 0], at: ['an', 96, AY] },
    end: { t: -70, a: [70, 50], l: [40, 110, 0], at: ['an', 96, AY] },
    other: [{ k: 'rope', from: 'wr', to: [222, 176] }],
    hold: 'none',
  },
  turkish: {
    start: { t: 180, a: [-90, -90], l: [-40, 50, 0], at: ['hip', 116, 176] },
    end: { t: -80, a: [-92, -92], a2: [100, 100], l: [-30, 60, 0], at: ['hip', 116, 176] },
  },
  sled_push: {
    start: { t: -30, a: [0, 0], l: [60, 120, 0], l2: [130, 140, 0], at: ['hip', 100, 112] },
    end: { t: -30, a: [0, 0], l: [130, 140, 0], l2: [60, 120, 0], at: ['hip', 104, 112] },
    other: [{ k: 'line', a: 'wr', b: [190, 150], w: 5 }, { k: 'box', x: 166, y: 150, w: 54, h: 34 }],
    hold: 'none',
  },
  sled_pull: {
    start: { t: -100, a: [20, 20], l: [70, 104, 0], l2: [112, 100, 0], at: ['hip', 110, 106] },
    end: { t: -100, a: [10, 160], l: [112, 100, 0], l2: [70, 104, 0], at: ['hip', 106, 106] },
    other: [{ k: 'line', a: 'wr', b: [190, 170], w: 3 }, { k: 'box', x: 180, y: 160, w: 44, h: 24 }],
    hold: 'none',
  },
  wall_ball: {
    start: { t: -66, a: [56, -112], l: SQ_BOTTOM_LEGS, at: ['an', X, AY] },
    end: stand([-80, -80]),
    other: [{ k: 'ball', at: 'wr', r: 12 }],
    hold: 'none',
  },
  ball_slam: {
    start: stand([-96, -96]),
    end: { t: -20, a: [100, 100], l: [60, 110, 0], at: ['an', X, AY] },
    other: [{ k: 'ball', at: 'wr', r: 12 }],
    hold: 'none',
  },
  bear_crawl: {
    start: { t: 0, a: [90, 90], l: [60, 150, 0], l2: [90, 120, 0], at: ['wr', 168, AY] },
    end: { t: 0, a: [90, 90], a2: [70, 110], l: [90, 120, 0], l2: [60, 150, 0], at: ['wr', 168, AY] },
    hold: 'none',
  },
  jumping_jack: {
    start: fstand([92, 92], { lr: [94, 90] }),
    end: fstand([-60, -70], { lr: [70, 74] }),
    hold: 'none',
  },
  high_knees: {
    start: { t: -86, a: [40, -60], a2: [130, 80], l: [-10, 90, 0], l2: [94, 90, 0], at: ['an2', X, AY] },
    end: { t: -86, a: [130, 80], a2: [40, -60], l: [94, 90, 0], l2: [-10, 90, 0], at: ['an', X, AY] },
    hold: 'none',
  },
  muscle_up: {
    start: hang([-90, -90], [94, 110, 60]),
    end: { t: -84, a: [94, 92], l: [94, 110, 60], at: ['wr', 124, 26] },
    scene: [{ k: 'bar', at: [124, 26] }],
    hold: 'none',
  },
  rope_climb: {
    start: { t: -90, a: [-90, -90], a2: [-60, -110], l: [40, 120, 0], at: ['wr', 128, 30] },
    end: { t: -90, a: [-60, -110], a2: [-90, -90], l: [90, 90, 0], at: ['wr', 128, 44] },
    scene: [{ k: 'line', a: [128, 4], b: [128, 188], w: 4 }],
    hold: 'none',
  },
  front_lever: {
    start: { t: 180, a: [-80, -80], l: [0, 0, 0], at: ['wr', 96, 26] },
    end: { t: 180, a: [-80, -80], l: [0, 0, 0], at: ['wr', 96, 26] },
    scene: [{ k: 'bar', at: [96, 26] }],
    hold: 'none',
  },
  dead_hang: {
    start: hang([-90, -90], [92, 92, 30]),
    end: hang([-90, -90], [92, 92, 30]),
    scene: [{ k: 'bar', at: [124, 26] }],
    hold: 'none',
  },
  handstand: {
    start: { t: 90, a: [90, 90], l: [-90, -90, 0], at: ['wr', X, 182] },
    end: { t: 90, a: [90, 90], l: [-86, -90, 0], at: ['wr', X, 182] },
    hold: 'none',
  },
  handstand_pushup: {
    start: { t: 90, a: [90, 90], l: [-90, -90, 0], at: ['wr', X, 182] },
    end: { t: 90, a: [36, 144], l: [-90, -90, 0], at: ['wr', X, 182] },
    scene: [{ k: 'line', a: [92, 20], b: [92, 188], w: 6 }],
    hold: 'none',
  },
  pike_pushup: {
    start: { t: 52, a: [96, 96], l: [124, 124, 180], at: ['wr', 168, 182] },
    end: { t: 66, a: [30, 140], l: [118, 118, 180], at: ['wr', 168, 182] },
    hold: 'none',
  },
  svend: {
    start: stand([60, -110]),
    end: stand([0, 0]),
    other: [{ k: 'plate', at: 'wr', r: 13 }],
    hold: 'none',
  },
  plate_raise: {
    start: stand([90, 90]),
    end: stand([-60, -60]),
    other: [{ k: 'plate', at: 'wr', r: 14 }],
    hold: 'none',
  },
  plate_curl: {
    start: stand([92, 90]),
    end: stand([84, -64]),
    other: [{ k: 'plate', at: 'wr', r: 14 }],
    hold: 'none',
  },
  neck_curl: {
    start: { t: 180, hd: 200, a: [10, 0], l: [0, 0, -80], at: ['hip', 160, 120] },
    end: { t: 180, hd: 140, a: [10, 0], l: [0, 0, -80], at: ['hip', 160, 120] },
    scene: [{ k: 'bench', a: [94, 132], b: [190, 132] }],
    hold: 'none',
  },
  neck_ext: {
    start: { t: 0, hd: 30, a: [100, 100], l: [180, 180, 90], at: ['hip', 100, 120] },
    end: { t: 0, hd: -30, a: [100, 100], l: [180, 180, 90], at: ['hip', 100, 120] },
    scene: [{ k: 'bench', a: [44, 132], b: [146, 132] }],
    hold: 'none',
  },
  around_world: {
    start: lie([-150, -150]),
    end: lie([-30, -30]),
    scene: [FLAT_BENCH],
  },
  squeeze_press: {
    start: lie([-90, -90]),
    end: lie([28, -92]),
    scene: [FLAT_BENCH],
  },

  // ── 유산소 ──
  run: {
    start: { t: -80, a: [40, -50], a2: [130, 70], l: [40, 120, 0], l2: [120, 150, 30], at: ['hip', X, 104] },
    end: { t: -80, a: [130, 70], a2: [40, -50], l: [120, 150, 30], l2: [40, 120, 0], at: ['hip', X, 104] },
    hold: 'none',
  },
  treadmill: {
    start: { t: -82, a: [40, -50], a2: [130, 70], l: [50, 110, 0], l2: [116, 140, 30], at: ['hip', 110, 108] },
    end: { t: -82, a: [130, 70], a2: [40, -50], l: [116, 140, 30], l2: [50, 110, 0], at: ['hip', 110, 108] },
    scene: [{ k: 'pad', a: [40, 182], b: [190, 182], w: 8 }, { k: 'line', a: [182, 182], b: [200, 70], w: 4 }],
    hold: 'none',
  },
  walk: {
    start: { t: -88, a: [70, 100], a2: [110, 90], l: [70, 100, 0], l2: [112, 92, 0], at: ['hip', X, 107] },
    end: { t: -88, a: [110, 90], a2: [70, 100], l: [112, 92, 0], l2: [70, 100, 0], at: ['hip', X, 107] },
    hold: 'none',
  },
  cycle: {
    start: { t: -60, a: [10, 30], l: [-10, 100, 0], l2: [40, 120, 0], at: ['hip', 100, 104] },
    end: { t: -60, a: [10, 30], l: [40, 120, 0], l2: [-10, 100, 0], at: ['hip', 100, 104] },
    scene: [
      { k: 'wheel', at: [70, 160], r: 24 },
      { k: 'wheel', at: [174, 160], r: 24 },
      { k: 'line', a: [70, 160], b: [118, 158], w: 4 },
      { k: 'line', a: [118, 158], b: [174, 160], w: 4 },
      { k: 'line', a: [100, 112], b: [118, 158], w: 4 },
      { k: 'line', a: [118, 158], b: [150, 112], w: 4 },
    ],
    hold: 'none',
  },
  stationary_bike: {
    start: { t: -70, a: [10, 30], l: [-10, 100, 0], l2: [40, 120, 0], at: ['hip', 100, 104] },
    end: { t: -70, a: [10, 30], l: [40, 120, 0], l2: [-10, 100, 0], at: ['hip', 100, 104] },
    scene: [
      { k: 'wheel', at: [160, 160], r: 18 },
      { k: 'line', a: [100, 112], b: [118, 158], w: 5 },
      { k: 'line', a: [80, 186], b: [180, 186], w: 6 },
      { k: 'line', a: [118, 158], b: [118, 186], w: 5 },
      { k: 'line', a: [150, 86], b: [160, 160], w: 5 },
    ],
    hold: 'none',
  },
  recumbent: {
    start: { t: -120, a: [60, 20], l: [-10, 30, -80], l2: [10, 60, -80], at: ['hip', 100, 140] },
    end: { t: -120, a: [60, 20], l: [10, 60, -80], l2: [-10, 30, -80], at: ['hip', 100, 140] },
    scene: [{ k: 'pad', a: [104, 150], b: [70, 92], w: 9 }, { k: 'bench', a: [80, 150], b: [130, 150] }, { k: 'wheel', at: [180, 150], r: 16 }],
    hold: 'none',
  },
  row: {
    start: { t: -60, a: [6, 6], l: [-60, 70, -90], at: ['hip', 96, 162] },
    end: { t: -112, a: [150, 0], l: [-6, 10, -90], at: ['hip', 70, 162] },
    scene: [{ k: 'line', a: [30, 172], b: [200, 172], w: 6 }, { k: 'stack', x: 196, top: 130 }],
    hold: 'none',
  },
  elliptical: {
    start: { t: -84, a: [20, -40], a2: [60, -10], l: [70, 104, 0], l2: [104, 90, 0], at: ['hip', X, 96] },
    end: { t: -84, a: [60, -10], a2: [20, -40], l: [104, 90, 0], l2: [70, 104, 0], at: ['hip', X, 96] },
    scene: [{ k: 'line', a: [60, 186], b: [200, 186], w: 6 }, { k: 'line', a: [180, 186], b: [170, 60], w: 5 }],
    hold: 'none',
  },
  stairs: {
    start: { t: -82, a: [20, -40], l: [20, 110, 0], l2: [94, 90, 0], at: ['an2', 110, 172] },
    end: { t: -84, a: [20, -40], l: [94, 90, 0], l2: [20, 110, 0], at: ['an', 136, 152] },
    scene: [{ k: 'box', x: 90, y: 176, w: 60, h: 12 }, { k: 'box', x: 120, y: 156, w: 60, h: 32 }, { k: 'box', x: 150, y: 136, w: 60, h: 52 }],
    hold: 'none',
  },
  skierg: {
    start: stand([-80, -80]),
    end: { t: -20, a: [100, 100], l: [60, 110, 0], at: ['an', X, AY] },
    scene: [{ k: 'column', x: 196, top: 20 }],
    other: [{ k: 'cable', from: [190, 34], to: 'wr' }],
    hold: 'none',
  },
  jump_rope: {
    start: { t: -90, a: [70, 20], l: [92, 90, 40], at: ['an', X, 172] },
    end: { t: -90, a: [70, 20], l: [92, 90, 40], at: ['an', X, 176] },
    scene: [{ k: 'loop', cx: 130, cy: 96, rx: 40, ry: 92 }],
    hold: 'none',
  },
  swim: {
    start: { t: 0, a: [-6, -6], a2: [120, 150], l: [182, 182, 180], l2: [174, 174, 180], at: ['hip', 90, 120] },
    end: { t: 0, a: [120, 150], a2: [-6, -6], l: [174, 174, 180], l2: [182, 182, 180], at: ['hip', 90, 120] },
    scene: [{ k: 'line', a: [20, 112], b: [220, 112], w: 2 }],
    hold: 'none',
  },
  boxing: {
    start: { t: -84, a: [60, -70], a2: [80, -80], l: [74, 100, 0], l2: [106, 90, 0], at: ['hip', 110, 108] },
    end: { t: -80, a: [-6, -4], a2: [80, -80], l: [74, 100, 0], l2: [106, 90, 0], at: ['hip', 110, 108] },
    hold: 'none',
  },
  climb: {
    start: { t: -96, a: [-70, -100], a2: [-20, -60], l: [20, 110, 0], l2: [80, 90, 0], at: ['hip', 130, 110] },
    end: { t: -96, a: [-20, -60], a2: [-70, -100], l: [80, 90, 0], l2: [20, 110, 0], at: ['hip', 130, 96] },
    scene: [{ k: 'line', a: [168, 8], b: [168, 188], w: 6 }],
    hold: 'none',
  },
  hike: {
    start: { t: -80, a: [60, 100], a2: [110, 90], l: [60, 100, 0], l2: [112, 92, 0], at: ['hip', X, 107] },
    end: { t: -80, a: [110, 90], a2: [60, 100], l: [112, 92, 0], l2: [60, 100, 0], at: ['hip', X, 107] },
    scene: [{ k: 'line', a: [20, 188], b: [220, 168], w: 2 }],
    hold: 'none',
  },
  sprint: {
    start: { t: -66, a: [20, -70], a2: [150, 80], l: [20, 140, 0], l2: [130, 160, 30], at: ['hip', X, 104] },
    end: { t: -66, a: [150, 80], a2: [20, -70], l: [130, 160, 30], l2: [20, 140, 0], at: ['hip', X, 104] },
    hold: 'none',
  },
  yoga: {
    start: { t: -90, a: [-90, -90], l: [90, 90, 0], l2: [40, 150, 0], at: ['an', X, AY] },
    end: { t: -90, a: [-90, -90], l: [90, 90, 0], l2: [40, 150, 0], at: ['an', X, AY] },
    hold: 'none',
  },
  pilates: {
    start: { t: 180, a: [0, 0], l: [-60, -60, 0], at: ['hip', 120, 178] },
    end: { t: 200, a: [10, 10], l: [-40, -40, 0], at: ['hip', 120, 178] },
    hold: 'none',
  },
  skate: {
    start: { t: -40, a: [140, 120], a2: [40, 20], l: [50, 120, 0], l2: [150, 170, 0], at: ['hip', 110, 128] },
    end: { t: -40, a: [40, 20], a2: [140, 120], l: [150, 170, 0], l2: [50, 120, 0], at: ['hip', 110, 128] },
    hold: 'none',
  },
  ski: {
    start: { t: -60, a: [60, 100], l: [40, 120, 10], at: ['hip', 110, 124] },
    end: { t: -56, a: [80, 110], l: [36, 124, 10], at: ['hip', 110, 126] },
    scene: [{ k: 'line', a: [40, 188], b: [210, 180], w: 4 }],
    other: [{ k: 'line', a: 'wr', b: [170, 186], w: 2 }],
    hold: 'none',
  },
  snowboard: {
    start: { view: 'front', ar: [10, 30], lr: [70, 110], at: ['hip', X, 128] },
    end: { view: 'front', ar: [-10, 10], lr: [74, 106], at: ['hip', X, 126], tilt: 6 },
    scene: [{ k: 'line', a: [50, 186], b: [190, 186], w: 7 }],
    hold: 'none',
  },
  stretch: {
    start: stand([90, 90]),
    end: { t: 60, a: [90, 90], l: [90, 90, 0], at: ['an', X, AY] },
    hold: 'none',
  },
  aerobic: {
    start: fstand([-60, -70], { lr: [86, 90] }),
    end: fstand([30, -40], { lr: [70, 110], ll: [100, 90] }),
    hold: 'none',
  },
};
