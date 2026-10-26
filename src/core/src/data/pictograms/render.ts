// @plm SRS-055  종목 → 픽토그램 SVG — family 의 자세 + 그 종목의 기구 + 주동근 강조(ADR-036).
//
// 종목 하나의 그림은 세 가지로 정해진다:
//   ① 원형(archetype) — family 가 고른다(FAMILY_ARCH). 같은 family 는 기구가 달라도 같은 몸동작이다.
//      유산소는 family 가 하나(cardio)라 종목 영문명으로 고른다(CARDIO_ARCH).
//   ② 기구 — 바벨·덤벨·케이블… 은 손(또는 원형이 정한 관절)에 붙고, 머신·케이블은 원형이 정한 틀을 그린다.
//   ③ 주동근 — 첫 번째 primary 근육 부위를 브랜드 색으로.
//
// 결과는 SVG 문자열이다. 색은 CSS 변수라 화면 테마를 따른다. 사용자 입력은 한 글자도 들어가지 않는다.
import { CATALOG } from '../catalog/catalog.generated';
import { ARCH, type Arch, type Item, type P } from './poses';
import {
  COLOR,
  GROUND_Y,
  VIEW_H,
  VIEW_W,
  ball,
  band,
  barbellFront,
  barbellSide,
  bench,
  cableColumn,
  cableLine,
  circle,
  drawFront,
  drawSide,
  dumbbell,
  ezbarSide,
  ground,
  joints,
  kettlebell,
  lerpPose,
  line,
  plateHeld,
  pullBarFront,
  pullBarSide,
  pulley,
  rect,
  slab,
  smithRails,
  trapbarSide,
  weightStack,
  type Equip,
  type Joint,
  type Joints,
  type Muscle,
  type Pt,
} from './rig';

/** family → 원형. 객체면 기구별로 다른 원형(d = 기본). */
export const FAMILY_ARCH: Record<string, string | ({ d: string } & Partial<Record<Equip, string>>)> = {
  bench_press: 'bench_press',
  incline_press: 'incline_press',
  decline_press: 'decline_press',
  chest_fly: 'fly_lying',
  incline_fly: 'incline_fly',
  cable_crossover: 'cable_crossover',
  low_to_high_fly: 'low_to_high_fly',
  chest_press: 'chest_press',
  dips: 'dips',
  push_up: 'push_up',
  incline_push_up: 'push_up_incline',
  deadlift: 'deadlift',
  sumo_deadlift: 'sumo_deadlift',
  rack_pull: 'rack_pull',
  bent_over_row: 'bent_over_row',
  pendlay_row: 'pendlay_row',
  t_bar_row: 't_bar_row',
  one_arm_row: 'one_arm_row',
  seated_row: 'seated_row',
  lat_pulldown: 'lat_pulldown',
  straight_arm_pulldown: 'straight_arm_pulldown',
  pull_up: 'pull_up',
  chin_up: 'pull_up',
  back_extension: 'back_extension',
  good_morning: 'good_morning',
  overhead_press: 'overhead_press',
  arnold_press: 'seated_press',
  lateral_raise: 'lateral_raise',
  front_raise: { d: 'front_raise', other: 'plate_raise' },
  rear_delt_fly: 'rear_delt_fly',
  face_pull: 'face_pull',
  upright_row: 'upright_row',
  curl: 'curl',
  hammer_curl: 'curl',
  incline_curl: 'incline_curl',
  preacher_curl: 'preacher_curl',
  concentration_curl: 'concentration_curl',
  spider_curl: 'spider_curl',
  close_grip_bench_press: 'bench_press',
  pushdown: 'pushdown',
  overhead_triceps_extension: 'overhead_ext',
  skull_crusher: 'skull_crusher',
  triceps_kickback: 'kickback',
  bench_dip: 'bench_dip',
  diamond_push_up: 'push_up',
  wrist_curl: 'wrist_curl',
  reverse_wrist_curl: 'wrist_curl',
  reverse_curl: 'curl',
  farmers_walk: 'farmers_walk',
  squat: { d: 'squat', dumbbell: 'squat_dumbbell', bodyweight: 'air_squat', other: 'air_squat' },
  front_squat: { d: 'front_squat', dumbbell: 'goblet_squat', kettlebell: 'goblet_squat' },
  hack_squat: 'hack_squat',
  leg_press: 'leg_press',
  leg_extension: 'leg_extension',
  goblet_squat: 'goblet_squat',
  lunge: { d: 'lunge', barbell: 'lunge_bar', smith: 'lunge_bar' },
  walking_lunge: { d: 'lunge', barbell: 'lunge_bar' },
  bulgarian_split_squat: 'bulgarian',
  step_up: 'step_up',
  romanian_deadlift: 'romanian_deadlift',
  stiff_leg_deadlift: 'stiff_leg',
  lying_leg_curl: 'lying_leg_curl',
  seated_leg_curl: 'seated_leg_curl',
  nordic_curl: 'nordic',
  hip_thrust: 'hip_thrust',
  glute_bridge: 'glute_bridge',
  glute_kickback: 'kickback_glute',
  hip_abduction: { d: 'hip_abduction', cable: 'abduction_standing', band: 'abduction_standing' },
  kettlebell_swing: 'kb_swing',
  calf_raise: { d: 'calf_raise', barbell: 'calf_raise_bar', smith: 'calf_raise_bar' },
  seated_calf_raise: 'seated_calf',
  leg_press_calf_raise: 'leg_press_calf',
  plank: 'plank',
  side_plank: 'side_plank',
  crunch: { d: 'crunch', cable: 'crunch_kneeling' },
  bicycle_crunch: 'bicycle',
  hanging_leg_raise: 'hanging_leg_raise',
  reverse_crunch: 'reverse_crunch',
  russian_twist: 'russian_twist',
  ab_rollout: 'rollout',
  decline_sit_up: 'decline_sit_up',
  mountain_climber: 'mountain_climber',
  shrug: 'shrug',
  clean: 'clean',
  clean_and_jerk: 'clean_jerk',
  snatch: 'snatch',
  thruster: 'thruster',
  burpee: 'burpee',
  battle_rope: 'battle_rope',
  assisted_pull_up: 'assisted_pull',
  assisted_chin_up: 'assisted_pull',
  assisted_dip: 'assisted_dip',
  high_row: 'high_row',
  low_row: 'low_row',
  chest_supported_row: 'chest_supported_row',
  inverted_row: 'inverted_row',
  pullover: 'pullover',
  landmine_press: 'landmine_press',
  sissy_squat: 'sissy',
  pendulum_squat: 'pendulum_squat',
  belt_squat: 'belt_squat',
  hip_adduction: { d: 'hip_adduction', cable: 'adduction_standing' },
  jm_press: 'skull_crusher',
  lying_leg_raise: 'leg_raise_lying',
  woodchop: 'woodchop',
  seated_cable_chest_press: 'chest_press',
  larsen_press: 'bench_press',
  feet_up_bench_press: 'bench_press',
  deficit_push_up: 'push_up',
  chest_supported_t_bar_row: 'chest_supported_t_bar',
  sit_up: 'sit_up',
  decline_push_up: 'push_up_decline',
  clap_push_up: 'push_up',
  kneeling_push_up: 'knee_push_up',
  one_arm_push_up: 'push_up',
  plank_push_up: 'plank_high',
  floor_press: 'floor_press',
  squeeze_press: 'squeeze_press',
  svend_press: 'svend',
  decline_fly: 'fly_lying',
  seated_cable_fly: 'pec_deck',
  around_the_world: 'around_world',
  landmine_row: 't_bar_row',
  meadows_row: 't_bar_row',
  seal_row: 'seal_row',
  gorilla_row: 'bent_over_row',
  renegade_row: 'renegade',
  negative_pull_up: 'pull_up',
  scapular_pull_up: 'dead_hang',
  kipping_pull_up: 'pull_up',
  sternum_pull_up: 'pull_up',
  muscle_up: 'muscle_up',
  dead_hang: 'dead_hang',
  superman: 'superman',
  pike_push_up: 'pike_pushup',
  handstand_push_up: 'handstand_pushup',
  handstand_hold: 'handstand',
  push_press: 'push_press',
  band_pull_apart: 'pull_apart',
  y_raise: 'y_raise',
  overhead_plate_raise: 'plate_raise',
  shoulder_tap: 'plank_high',
  kettlebell_halo: 'halo',
  drag_curl: 'drag_curl',
  zottman_curl: 'curl',
  cross_body_hammer_curl: 'curl',
  waiter_curl: 'curl',
  curl_21s: 'curl',
  overhead_cable_curl: 'overhead_cable_curl',
  behind_back_cable_curl: 'curl',
  plate_curl: 'plate_curl',
  machine_arm_extension: 'arm_extension_machine',
  tate_press: 'skull_crusher',
  wrist_roller: 'wrist_roller',
  behind_back_wrist_curl: 'behind_back_wrist',
  jump_shrug: 'shrug',
  neck_curl: 'neck_curl',
  neck_extension: 'neck_ext',
  box_squat: 'box_squat',
  pause_squat: 'squat',
  overhead_squat: 'overhead_squat',
  zercher_squat: 'goblet_squat',
  sumo_squat: 'sumo_squat',
  pistol_squat: 'pistol',
  wall_sit: 'wall_sit',
  jump_squat: 'jump_squat',
  box_jump: 'box_jump',
  lateral_box_jump: 'box_jump',
  frog_jump: 'broad_jump',
  lateral_squat: 'lateral_lunge',
  reverse_lunge: { d: 'reverse_lunge', barbell: 'lunge_bar', smith: 'lunge_bar' },
  lateral_lunge: 'lateral_lunge',
  curtsy_lunge: 'reverse_lunge',
  jump_lunge: 'lunge',
  overhead_lunge: 'overhead_lunge',
  split_squat: { d: 'lunge', barbell: 'lunge_bar', smith: 'lunge_bar' },
  glute_ham_raise: 'ghr',
  standing_leg_curl: 'standing_leg_curl',
  pull_through: 'pull_through',
  reverse_hyperextension: 'reverse_hyper',
  deadlift_high_pull: 'high_pull',
  fire_hydrant: 'fire_hydrant',
  clamshell: 'clamshell',
  frog_pump: 'frog_pump',
  bird_dog: 'bird_dog',
  lateral_leg_raise: 'side_leg_raise',
  lateral_band_walk: 'band_walk',
  dead_bug: 'dead_bug',
  v_sit_up: 'v_sit',
  hollow_rock: 'hollow',
  flutter_kick: 'flutter',
  scissor_kick: 'flutter',
  toe_touch: 'toe_touch',
  heel_tap: 'crunch',
  side_crunch: 'crunch',
  side_bend: 'side_bend',
  decline_crunch: 'decline_sit_up',
  lying_knee_raise: 'knee_raise_lying',
  hanging_knee_raise: 'hanging_knee_raise',
  parallel_bar_knee_raise: 'captain_chair',
  parallel_bar_leg_raise: 'captain_chair',
  dragon_flag: 'dragon_flag',
  reverse_plank: 'plank',
  elbow_to_knee: 'bicycle',
  spiderman_plank: 'mountain_climber',
  pallof_press: 'pallof',
  landmine_180: 'landmine_180',
  toes_to_bar: 'toes_to_bar',
  l_sit: 'l_sit',
  torso_rotation: 'torso_rotation',
  hang_clean: 'clean',
  clean_and_press: 'clean_jerk',
  clean_pull: 'high_pull',
  power_snatch: 'snatch',
  hang_snatch: 'snatch',
  split_jerk: 'clean_jerk',
  press_under: 'overhead_squat',
  landmine_squat_press: 'landmine_press',
  kettlebell_high_pull: 'high_pull',
  turkish_get_up: 'turkish',
  kettlebell_around_world: 'halo',
  sled_push: 'sled_push',
  sled_pull: 'sled_pull',
  suitcase_carry: 'farmers_walk',
  wall_ball: 'wall_ball',
  ball_slam: 'ball_slam',
  bear_crawl: 'bear_crawl',
  front_lever: 'front_lever',
  burpee_broad_jump: 'broad_jump',
  burpee_over_bar: 'burpee',
  jumping_jack: 'jumping_jack',
  high_knees: 'high_knees',
  front_lever_raise: 'front_lever',
  deficit_deadlift: 'deadlift',
  behind_neck_press: 'behind_neck_press',
  external_rotation: 'external_rotation',
  internal_rotation: 'internal_rotation',
  plate_pinch: 'plate_pinch',
  overhead_carry: 'overhead_carry',
  landmine_squat: 'goblet_squat',
  seated_leg_press: 'seated_leg_press',
  v_squat: 'v_squat',
  reverse_nordic: 'nordic',
  ball_leg_curl: 'glute_bridge',
  copenhagen_plank: 'copenhagen',
  donkey_calf_raise: 'donkey_calf',
  kettlebell_windmill: 'windmill',
  windshield_wiper: 'leg_raise_lying',
  archer_push_up: 'push_up',
  hindu_push_up: 'pike_pushup',
  power_jerk: 'clean_jerk',
  broad_jump: 'broad_jump',
  tuck_jump: 'jump_squat',
  skater_jump: 'skate',
  rear_delt_row: 'face_pull',
  rope_climb: 'rope_climb',
  devil_press: 'burpee',
};

/** 유산소 — family 가 하나(cardio)라 영문명으로 고른다. */
export const CARDIO_ARCH: Record<string, string> = {
  'Rowing Machine': 'row',
  'Treadmill Running': 'treadmill',
  Running: 'run',
  Walking: 'walk',
  'Indoor Cycling': 'stationary_bike',
  Elliptical: 'elliptical',
  'Stair Climber': 'stairs',
  'Jump Rope': 'jump_rope',
  'Assault Bike': 'stationary_bike',
  Stepper: 'stairs',
  SkiErg: 'skierg',
  Swimming: 'swim',
  Boxing: 'boxing',
  Climbing: 'climb',
  Hiking: 'hike',
  Sprint: 'sprint',
  'Outdoor Cycling': 'cycle',
  'Recumbent Bike': 'recumbent',
  HIIT: 'burpee',
  Aerobics: 'aerobic',
  Yoga: 'yoga',
  Pilates: 'pilates',
  Skating: 'skate',
  Skiing: 'ski',
  Snowboarding: 'snowboard',
  Stretching: 'stretch',
};

export interface PictoSpec {
  arch: string;
  equip: Equip;
  muscle: Muscle;
}

const EQUIPS: Equip[] = ['barbell', 'dumbbell', 'kettlebell', 'cable', 'band', 'machine', 'smith', 'ezbar', 'trapbar', 'bodyweight', 'other'];
const MUSCLES: Muscle[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'calves', 'abs', 'traps', 'fullBody', 'other'];

/** 종목 행 → 그림 사양. 원형이 없으면 null(커스텀·미지정 family). */
export function specFor(row: {
  family?: string | null;
  equipment?: string | null;
  primaryMuscles?: readonly string[] | null;
  kind?: string | null;
  nameEn?: string | null;
}): PictoSpec | null {
  const equip = (EQUIPS as string[]).includes(row.equipment ?? '') ? (row.equipment as Equip) : 'other';
  const m0 = row.primaryMuscles?.[0] ?? 'other';
  const muscle: Muscle = row.kind === 'cardio' ? 'cardio' : (MUSCLES as string[]).includes(m0) ? (m0 as Muscle) : 'other';
  let arch: string | undefined;
  if (row.kind === 'cardio' || row.family === 'cardio') arch = CARDIO_ARCH[row.nameEn ?? ''];
  else if (row.family) {
    const m = FAMILY_ARCH[row.family];
    arch = typeof m === 'string' ? m : m ? (m[equip] ?? m.d) : undefined;
  }
  if (!arch || !ARCH[arch]) return null;
  return { arch, equip, muscle };
}

let byId: Map<string, PictoSpec | null> | null = null;
/** 시드 종목 id → 그림 사양(번들 카탈로그 표). */
export function specForId(id: string): PictoSpec | null {
  if (!byId) {
    byId = new Map();
    for (const r of CATALOG) byId.set(r.id, specFor(r));
  }
  return byId.get(id) ?? null;
}

/** 기구별로 갈아타는 원형(arch.use)까지 따라간 실제 원형. */
export function resolveArch(spec: PictoSpec): Arch {
  let a = ARCH[spec.arch];
  for (let i = 0; i < 2; i++) {
    const next = a.use?.[spec.equip];
    if (!next || !ARCH[next]) break;
    a = ARCH[next];
  }
  return a;
}

// ── 그리기 ──────────────────────────────────────────────────────────────────

function at(p: P, j: Joints): Pt {
  return typeof p === 'string' ? j[p] : p;
}
const isDyn = (it: Item) =>
  Object.values(it).some((v) => typeof v === 'string' && v !== it.k && /^(hip|sh|sh2|neck|head|el|wr|kn|an|toe|el2|wr2|kn2|an2|toe2|chest|mid)$/.test(v));

function item(it: Item, j: Joints): string {
  switch (it.k) {
    case 'bench':
      return bench(it.a, it.b, it.legs !== false);
    case 'pad': {
      let a = at(it.a, j);
      let b = at(it.b, j);
      if (it.off) {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        const nx = (dy / len) * it.off;
        const ny = (-dx / len) * it.off;
        a = [a[0] + nx, a[1] + ny];
        b = [b[0] + nx, b[1] + ny];
      }
      // 넓은 등받이·패드는 옅게 — 몸과 겹쳐도 몸이 묻히지 않게
      return slab(a, b, it.w ?? 9, (it.w ?? 9) >= 20 ? COLOR.soft : COLOR.equip);
    }
    case 'stack':
      return weightStack(it.x, it.top);
    case 'column':
      return cableColumn(it.x, it.top);
    case 'lever':
      return line(it.pivot, at(it.to, j), it.w ?? 5, COLOR.equip) + circle(it.pivot, 4, COLOR.equip);
    case 'bar':
      return pullBarSide(it.at);
    case 'barF':
      return pullBarFront(it.y, it.x1, it.x2);
    case 'box':
      return rect(it.x, it.y, it.w, it.h, COLOR.soft, 4);
    case 'plate':
      return plateHeld(at(it.at, j), it.r);
    case 'ball':
      return ball(at(it.at, j), it.r);
    case 'line':
      return line(at(it.a, j), at(it.b, j), it.w ?? 4, COLOR.equip);
    case 'wheel':
      return circle(it.at, it.r, 'none', COLOR.equip, 4);
    case 'dbl':
      return dumbbell(at(it.at, j), it.ang ?? 0);
    case 'kb':
      return kettlebell(at(it.at, j));
    case 'barbell':
      return barbellSide(at(it.at, j));
    case 'cable':
      return pulley(it.from) + cableLine(it.from, at(it.to, j));
    case 'band':
      return band(at(it.from, j), at(it.to, j));
    case 'loop':
      return `<ellipse cx="${it.cx}" cy="${it.cy}" rx="${it.rx}" ry="${it.ry}" fill="none" stroke="${COLOR.equip}" stroke-width="2.5"/>`;
    case 'rope': {
      const a = at(it.from, j);
      const b = it.to;
      const mx = (a[0] + b[0]) / 2;
      return `<path d="M${a[0].toFixed(1)},${a[1].toFixed(1)} Q${(mx - 20).toFixed(1)},${(a[1] - 26).toFixed(1)} ${mx.toFixed(1)},${((a[1] + b[1]) / 2).toFixed(1)} T${b[0]},${b[1]}" fill="none" stroke="${COLOR.equip}" stroke-width="4" stroke-linecap="round"/>`;
    }
  }
}

const FREE: Equip[] = ['barbell', 'smith', 'ezbar', 'trapbar', 'dumbbell', 'kettlebell'];

function holdPoint(hold: Joint, j: Joints): Pt {
  const p = j[hold];
  if (hold === 'hip') return [p[0] + 2, p[1] - 14];
  if (hold === 'kn') return [p[0], p[1] - 10];
  return p;
}

/** 손에 든 프리웨이트. */
function held(spec: PictoSpec, a: Arch, j: Joints, front: boolean): string[] {
  const hold = (a.hold ?? 'wr') as Joint | 'none';
  if (hold === 'none' || !FREE.includes(spec.equip)) return [];
  const p = holdPoint(hold, j);
  if (front) {
    if (spec.equip === 'dumbbell') return [dumbbell(j.wr, 90), dumbbell(j.wr2, 90)];
    if (spec.equip === 'kettlebell') return [kettlebell(j.wr), kettlebell(j.wr2)];
    const l = hold === 'sh' ? j.sh2 : j.wr2;
    const r = hold === 'sh' ? j.sh : j.wr;
    if (hold === 'sh') return [barbellFront([l[0], l[1] - 3], [r[0], r[1] - 3])];
    return [barbellFront(l, r)];
  }
  switch (spec.equip) {
    case 'dumbbell':
      return [dumbbell(p, 0)];
    case 'kettlebell':
      return [kettlebell(p)];
    case 'ezbar':
      return [ezbarSide(p)];
    case 'trapbar':
      return [trapbarSide(p)];
    default:
      return [barbellSide(p)];
  }
}

/** 한 프레임(0 = 시작, 1 = 끝)의 SVG 안쪽. */
export function renderFrame(spec: PictoSpec, t: number): string {
  const a = resolveArch(spec);
  const pose = lerpPose(a.start, a.end, ease(t));
  const j = joints(pose);
  const j0 = joints(a.start);
  const front = pose.view === 'front';
  const fig = front ? drawFront(j, spec.muscle) : drawSide(j, spec.muscle);

  const bg: string[] = [ground()];
  const fg: string[] = [];
  const put = (it: Item) => (isDyn(it) ? fg : bg).push(item(it, j));
  for (const it of a.scene ?? []) put(it);

  const lines: string[] = [];
  switch (spec.equip) {
    case 'cable': {
      const c = a.cable ?? { from: [206, 60] as Pt, col: 212 };
      const to = (c.to ?? 'wr') as Joint;
      bg.push(cableColumn(c.col ?? c.from[0] + 6));
      bg.push(pulley(c.from));
      if (front && c.both) {
        const mirror: Pt = [VIEW_W - c.from[0], c.from[1]];
        bg.push(cableColumn(VIEW_W - (c.col ?? c.from[0])), pulley(mirror));
        lines.push(cableLine(c.from, j.wr2), cableLine(mirror, j.wr));
      } else if (front && to === 'wr' && (a.hold ?? 'wr') === 'wr' && c.from[0] === VIEW_W / 2) {
        // 가운데 도르래 + 바(랫풀다운)
        const mid: Pt = [(j.wr[0] + j.wr2[0]) / 2, (j.wr[1] + j.wr2[1]) / 2];
        lines.push(cableLine(c.from, mid), line([j.wr2[0] - 14, j.wr2[1]], [j.wr[0] + 14, j.wr[1]], 4, COLOR.equip));
      } else {
        lines.push(cableLine(c.from, j[to]));
      }
      break;
    }
    case 'band': {
      const b = a.band ?? { from: 'an' as P };
      lines.push(band(at(b.from, j), j[(b.to ?? 'wr') as Joint]));
      break;
    }
    case 'machine': {
      if (a.machine) for (const it of a.machine) put(it);
      else if ((a.hold ?? 'wr') !== 'none') {
        bg.push(weightStack(198, 60));
        lines.push(cableLine([209, 62], j.wr));
      }
      break;
    }
    case 'smith': {
      const hp = holdPoint((a.hold === 'none' ? 'wr' : (a.hold ?? 'wr')) as Joint, j0);
      bg.push(smithRails(hp[0]));
      break;
    }
    case 'other':
      for (const it of a.other ?? []) put(it);
      break;
    default:
      break;
  }

  return [...bg, ...fig.back, ...fig.body, ...fig.arm, ...fg, ...held(spec, a, j, front), ...lines].join('');
}

/** 시작·끝을 부드럽게(가속·감속). */
function ease(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : 0.5 - Math.cos(t * Math.PI) / 2;
}

/**
 * 그림이 들어갈 창 — 움직임 전체(시작·중간·끝)의 관절과 장면을 감싸고 6:5 로 맞춘다.
 * 같은 종목의 모든 프레임이 같은 창을 쓰므로 움직여도 화면이 흔들리지 않는다. 사람 키의 0.85 배보다
 * 작게 확대하지 않는다(맨손 종목이 지나치게 커 보이지 않게).
 */
export function viewBoxFor(spec: PictoSpec): string {
  const a = resolveArch(spec);
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (p: Pt, m = 0) => {
    xs.push(p[0] - m, p[0] + m);
    ys.push(p[1] - m, p[1] + m);
  };
  for (const t of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]) {
    const j = joints(lerpPose(a.start, a.end, t));
    for (const k of Object.keys(j) as Joint[]) add(j[k], k === 'head' ? 13 : 9);
    const hold = (a.hold ?? 'wr') as Joint | 'none';
    if (hold !== 'none' && FREE.includes(spec.equip)) add(holdPoint(hold, j), 23);
  }
  const items: Item[] = [...(a.scene ?? [])];
  if (spec.equip === 'machine') items.push(...(a.machine ?? []));
  if (spec.equip === 'other') items.push(...(a.other ?? []));
  for (const it of items) {
    for (const v of Object.values(it)) if (Array.isArray(v) && typeof v[0] === 'number') add(v as Pt, 6);
    if (it.k === 'box') add([it.x + it.w, it.y + it.h]);
    if (it.k === 'stack') add([it.x + 22, it.top]);
    if (it.k === 'wheel') add(it.at, it.r + 3);
    if (it.k === 'loop') {
      add([it.cx - it.rx, it.cy - it.ry]);
      add([it.cx + it.rx, it.cy + it.ry]);
    }
    if (it.k === 'bar') {
      add([it.at[0] - 36, it.at[1] - 28]);
      add([it.at[0] + 36, it.at[1]]);
    }
  }
  if (spec.equip === 'cable') {
    const c = a.cable ?? { from: [206, 60] as Pt };
    add(c.from, 8);
    if (c.both) add([VIEW_W - c.from[0], c.from[1]], 8);
  }
  if (spec.equip === 'machine' && !a.machine && (a.hold ?? 'wr') !== 'none') add([222, 60]);
  ys.push(GROUND_Y + 4);
  let x0 = Math.min(...xs) - 6;
  let x1 = Math.max(...xs) + 6;
  let y0 = Math.min(...ys) - 6;
  let y1 = Math.max(...ys) + 2;
  let w = x1 - x0;
  let h = y1 - y0;
  const minH = 150;
  if (h < minH) {
    y0 -= minH - h;
    h = minH;
  }
  // 6:5 로 넓히기
  if (w / h < VIEW_W / VIEW_H) {
    const nw = (h * VIEW_W) / VIEW_H;
    x0 -= (nw - w) / 2;
    w = nw;
  } else {
    const nh = (w * VIEW_H) / VIEW_W;
    y0 -= nh - h; // 바닥은 그대로, 위로 넓힌다
    h = nh;
  }
  x1 = x0 + w;
  y1 = y0 + h;
  const r = (n: number) => Math.round(n);
  return `${r(x0)} ${r(y0)} ${r(x1 - x0)} ${r(y1 - y0)}`;
}

function wrap(inner: string, vb: string, label?: string): string {
  const aria = label ? ` role="img" aria-label="${label.replace(/[<>&"]/g, '')}"` : ' aria-hidden="true"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="100%" height="100%"${aria}>${inner}</svg>`;
}

/**
 * 썸네일 창 — 대표 자세 한 장의 몸·든 기구만 바짝 감싼다(기둥·스택·바닥은 잘려도 된다).
 * 40px 칸에서 사람이 작게 보이지 않게. 너무 확대되지 않도록 최소 높이 90.
 */
export function thumbViewBoxFor(spec: PictoSpec): string {
  const a = resolveArch(spec);
  const j = joints((a.thumb ?? 'end') === 'start' ? a.start : a.end);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const k of Object.keys(j) as Joint[]) {
    const m = k === 'head' ? 13 : 8;
    xs.push(j[k][0] - m, j[k][0] + m);
    ys.push(j[k][1] - m, j[k][1] + m);
  }
  const hold = (a.hold ?? 'wr') as Joint | 'none';
  if (hold !== 'none' && FREE.includes(spec.equip)) {
    const p = holdPoint(hold, j);
    xs.push(p[0] - 22, p[0] + 22);
    ys.push(p[1] - 22, p[1] + 22);
  }
  let x0 = Math.min(...xs);
  let y0 = Math.min(...ys);
  let w = Math.max(...xs) - x0;
  let h = Math.max(...ys) - y0;
  const cx = x0 + w / 2;
  const cy = y0 + h / 2;
  h = Math.max(h, 90, (w * VIEW_H) / VIEW_W);
  w = (h * VIEW_W) / VIEW_H;
  x0 = cx - w / 2;
  y0 = cy - h / 2;
  const r = (n: number) => Math.round(n);
  return `${r(x0)} ${r(y0)} ${r(w)} ${r(h)}`;
}

/** 정지 그림 — 목록 썸네일(원형이 정한 대표 자세, 바짝 자른 창). 'start'·'end' 는 움직임과 같은 창. */
export function pictogramSvg(spec: PictoSpec, frame: 'start' | 'end' | 'thumb' = 'thumb', label?: string): string {
  const a = resolveArch(spec);
  const which = frame === 'thumb' ? (a.thumb ?? 'end') : frame;
  const vb = frame === 'thumb' ? thumbViewBoxFor(spec) : viewBoxFor(spec);
  return wrap(renderFrame(spec, which === 'start' ? 0 : 1), vb, label);
}

/** 움직임 프레임 — 시작 → 끝(steps+1 장). 화면이 앞뒤로 돌린다. */
export function pictogramFrames(spec: PictoSpec, steps = 6): string[] {
  const vb = viewBoxFor(spec);
  const out: string[] = [];
  for (let i = 0; i <= steps; i++) out.push(wrap(renderFrame(spec, i / steps), vb));
  return out;
}

export { GROUND_Y };
