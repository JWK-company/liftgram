// @plm SRS-031  종목 찾기 도우미(스무고개) 큐레이션 트리 — 부위별 '동작/자세' 세부 질문으로 종목을 좁힌다.
// 근육군·기구만으론 초보의 '내가 뭘 했는지' 문제를 못 풀어(같은 부위라도 밀기/당기기/스쿼트/힌지가 다름),
// 부위 아래 한 단계 '동작/자세' 질문을 큐레이션한다. 스키마 변경 없이 코드 데이터로 분류(성능·유지보수 단순).
import type { EquipmentType, MuscleGroup } from './types';

export interface FinderOption {
  key: string;
  labelKo: string;
  labelEn: string;
  ids: string[]; // 이 동작/자세에 해당하는 종목(seed id — 카탈로그 개편 P2 에서 nameKo 키를 id 로 옮겼다 · ADR-033) — 목록이 이 집합으로 좁혀진다.
}

// 부위별 '동작/자세' 세부 질문. 있으면 위저드 2단계에서 이걸 묻고 ids로 좁힌다.
// 없는 부위(이두·전완·승모·전신)는 동작이 균일하므로 대신 기구로 좁힌다.
export const FINDER_TREE: Partial<Record<MuscleGroup, FinderOption[]>> = {
  chest: [
    { key: 'flat', labelKo: '평평하게 밀기', labelEn: 'Flat press', ids: ['seed-barbell-bench-press', 'seed-dumbbell-bench-press', 'seed-chest-press-machine', 'seed-smith-machine-bench-press', 'seed-push-up', 'seed-lying-chest-press-machine', 'seed-seated-cable-chest-press', 'seed-standing-cable-chest-press', 'seed-lying-cable-chest-press', 'seed-larsen-press', 'seed-feet-up-bench-press', 'seed-deficit-push-up', 'seed-clap-push-up', 'seed-kneeling-push-up', 'seed-one-arm-push-up', 'seed-plank-push-up', 'seed-ring-push-up', 'seed-floor-press', 'seed-dumbbell-squeeze-press', 'seed-dumbbell-floor-press', 'seed-band-chest-press', 'seed-kettlebell-floor-press', 'seed-archer-push-up', 'seed-hindu-push-up'] }, // 갭 이관·대확장 @plm SRS-047
    { key: 'incline', labelKo: '위로 기울여 밀기(인클라인)', labelEn: 'Incline press', ids: ['seed-incline-press', 'seed-incline-press-dumbbell', 'seed-incline-press-machine', 'seed-incline-press-smith', 'seed-incline-push-up', 'seed-cable-incline-chest-press'] },
    { key: 'decline', labelKo: '아래로 밀기(디클라인·딥스)', labelEn: 'Decline / dips', ids: ['seed-decline-barbell-press', 'seed-decline-dumbbell-press', 'seed-decline-press-smith', 'seed-dips', 'seed-decline-chest-press-machine', 'seed-decline-push-up', 'seed-ring-dip'] }, // 갭 이관·대확장 @plm SRS-047
    { key: 'fly', labelKo: '모으기(플라이)', labelEn: 'Fly / squeeze', ids: ['seed-dumbbell-fly', 'seed-incline-dumbbell-fly', 'seed-cable-crossover', 'seed-low-cable-fly', 'seed-pec-deck-fly', 'seed-decline-dumbbell-fly', 'seed-seated-cable-fly', 'seed-dumbbell-around-the-world', 'seed-svend-press', 'seed-cable-incline-fly', 'seed-cable-lying-fly', 'seed-band-chest-fly'] },
  ],
  back: [
    { key: 'vertical', labelKo: '위에서 아래로 당기기(풀업·랫풀다운)', labelEn: 'Vertical pull', ids: ['seed-lat-pulldown', 'seed-pull-up', 'seed-chin-up', 'seed-assisted-pull-up', 'seed-negative-pull-up', 'seed-scapular-pull-up', 'seed-kipping-pull-up', 'seed-sternum-pull-up', 'seed-muscle-up', 'seed-ring-pull-up', 'seed-dead-hang', 'seed-front-lever-hold', 'seed-front-lever-raise', 'seed-machine-lat-pulldown', 'seed-band-lat-pulldown', 'seed-band-assisted-pull-up', 'seed-rope-climb'] }, // 대확장 @plm SRS-047
    { key: 'row', labelKo: '앞으로 당기기(로우)', labelEn: 'Row', ids: ['seed-barbell-row', 'seed-pendlay-row', 'seed-t-bar-row', 'seed-dumbbell-row', 'seed-seated-cable-row', 'seed-machine-row', 'seed-row-smith', 'seed-high-row', 'seed-low-row', 'seed-chest-supported-row', 'seed-chest-supported-row-dumbbell', 'seed-chest-supported-t-bar-row', 'seed-inverted-row', 'seed-landmine-row', 'seed-meadows-row', 'seed-seal-row', 'seed-gorilla-row', 'seed-renegade-row', 'seed-dumbbell-bent-over-row', 'seed-kettlebell-one-arm-row', 'seed-cable-high-row', 'seed-band-seated-row', 'seed-ring-row', 'seed-dumbbell-seal-row', 'seed-kettlebell-renegade-row', 'seed-smith-inverted-row', 'seed-kettlebell-bent-over-row'] }, // 갭 이관·대확장 @plm SRS-047
    { key: 'deadlift', labelKo: '바닥에서 들기(데드리프트·힌지)', labelEn: 'Deadlift / hinge', ids: ['seed-deadlift', 'seed-sumo-deadlift', 'seed-rack-pull', 'seed-good-morning', 'seed-hyperextension', 'seed-back-extension-machine', 'seed-superman', 'seed-trap-bar-deadlift', 'seed-dumbbell-deadlift', 'seed-kettlebell-deadlift', 'seed-smith-deadlift', 'seed-deficit-deadlift', 'seed-band-deadlift'] },
    { key: 'pullover', labelKo: '팔 펴서 당기기(풀오버)', labelEn: 'Pullover', ids: ['seed-dumbbell-pullover', 'seed-straight-arm-pulldown', 'seed-machine-pullover', 'seed-barbell-pullover', 'seed-band-straight-arm-pulldown'] },
  ],
  shoulders: [
    { key: 'press', labelKo: '위로 밀기(프레스)', labelEn: 'Press', ids: ['seed-overhead-press', 'seed-dumbbell-shoulder-press', 'seed-arnold-press', 'seed-shoulder-press-machine', 'seed-shoulder-press-smith', 'seed-landmine-press', 'seed-pike-push-up', 'seed-handstand-push-up', 'seed-handstand-hold', 'seed-push-press', 'seed-kettlebell-halo', 'seed-kettlebell-shoulder-press', 'seed-band-shoulder-press', 'seed-cable-shoulder-press', 'seed-barbell-behind-the-neck-press', 'seed-dumbbell-push-press', 'seed-kettlebell-push-press', 'seed-dumbbell-overhead-carry'] }, // 대확장 @plm SRS-047
    { key: 'lateral', labelKo: '옆으로 들기(레터럴)', labelEn: 'Lateral raise', ids: ['seed-side-lateral-raise', 'seed-cable-lateral-raise', 'seed-machine-lateral-raise', 'seed-upright-row', 'seed-upright-row-cable', 'seed-upright-row-dumbbell', 'seed-cable-y-raise', 'seed-chest-supported-y-raise', 'seed-smith-upright-row', 'seed-ez-bar-upright-row', 'seed-band-lateral-raise', 'seed-band-upright-row'] },
    { key: 'front', labelKo: '앞으로 들기(프론트)', labelEn: 'Front raise', ids: ['seed-front-raise', 'seed-front-raise-cable', 'seed-front-raise-barbell', 'seed-plate-front-raise', 'seed-overhead-plate-raise', 'seed-band-front-raise'] },
    { key: 'rear', labelKo: '뒤쪽 어깨(리어 델트)', labelEn: 'Rear delt', ids: ['seed-rear-delt-fly', 'seed-reverse-pec-deck', 'seed-face-pull', 'seed-cable-rear-delt-fly', 'seed-band-pull-apart', 'seed-band-face-pull', 'seed-band-rear-delt-fly', 'seed-cable-rear-delt-row', 'seed-cable-external-rotation', 'seed-dumbbell-external-rotation', 'seed-band-external-rotation', 'seed-cable-internal-rotation'] },
  ],
  triceps: [
    { key: 'press', labelKo: '미는 동작(프레스·딥)', labelEn: 'Press / dip', ids: ['seed-close-grip-bench-press', 'seed-bench-dip', 'seed-diamond-push-up', 'seed-jm-press', 'seed-dip-machine', 'seed-assisted-dip', 'seed-wide-elbow-triceps-press', 'seed-dumbbell-close-grip-press', 'seed-smith-close-grip-bench-press', 'seed-ez-bar-close-grip-press', 'seed-band-assisted-dip'] },
    { key: 'extension', labelKo: '펴는 동작(익스텐션·푸시다운)', labelEn: 'Extension', ids: ['seed-triceps-pushdown', 'seed-overhead-triceps-extension', 'seed-cable-overhead-extension', 'seed-skull-crusher', 'seed-skull-crusher-dumbbell', 'seed-triceps-kickback', 'seed-triceps-kickback-cable', 'seed-triceps-extension-machine', 'seed-machine-overhead-triceps-extension', 'seed-barbell-overhead-triceps-extension', 'seed-ez-bar-overhead-triceps-extension', 'seed-kettlebell-overhead-triceps-extension', 'seed-band-overhead-triceps-extension', 'seed-ez-bar-skull-crusher', 'seed-cable-skull-crusher', 'seed-band-pushdown', 'seed-band-triceps-kickback'] },
  ],
  quads: [
    { key: 'squat', labelKo: '앉았다 일어서기(스쿼트)', labelEn: 'Squat', ids: ['seed-barbell-squat', 'seed-front-squat', 'seed-hack-squat', 'seed-goblet-squat', 'seed-smith-machine-squat', 'seed-sissy-squat', 'seed-pendulum-squat', 'seed-belt-squat', 'seed-box-squat', 'seed-pause-squat', 'seed-overhead-squat', 'seed-zercher-squat', 'seed-sumo-squat', 'seed-pistol-squat', 'seed-wall-sit', 'seed-jump-squat', 'seed-box-jump', 'seed-lateral-box-jump', 'seed-frog-jump', 'seed-lateral-squat', 'seed-dumbbell-squat', 'seed-air-squat', 'seed-band-squat', 'seed-safety-bar-squat', 'seed-kettlebell-goblet-squat', 'seed-dumbbell-front-squat', 'seed-kettlebell-front-squat', 'seed-smith-front-squat', 'seed-barbell-sumo-squat', 'seed-kettlebell-sumo-squat', 'seed-barbell-hack-squat', 'seed-smith-sumo-squat', 'seed-landmine-squat', 'seed-machine-v-squat', 'seed-broad-jump', 'seed-tuck-jump'] }, // 대확장 @plm SRS-047 (레터럴 박스 점프=양발 플라이오 — 박스 점프 계열과 동일 슬롯)
    { key: 'lunge', labelKo: '한 다리씩(런지·스텝업)', labelEn: 'Lunge / step-up', ids: ['seed-lunge', 'seed-lunge-barbell', 'seed-lunge-smith', 'seed-walking-lunge', 'seed-bulgarian-split-squat', 'seed-bulgarian-split-squat-barbell', 'seed-bulgarian-split-squat-smith', 'seed-step-up', 'seed-reverse-lunge', 'seed-lateral-lunge', 'seed-curtsy-lunge', 'seed-jump-lunge', 'seed-overhead-lunge', 'seed-split-squat', 'seed-barbell-step-up', 'seed-barbell-walking-lunge', 'seed-dumbbell-reverse-lunge', 'seed-barbell-reverse-lunge', 'seed-smith-reverse-lunge', 'seed-dumbbell-lateral-lunge', 'seed-smith-split-squat', 'seed-barbell-split-squat', 'seed-kettlebell-lunge'] }, // 대확장 @plm SRS-047
    { key: 'press', labelKo: '밀기(레그 프레스)', labelEn: 'Leg press', ids: ['seed-leg-press', 'seed-seated-leg-press'] },
    { key: 'extension', labelKo: '무릎 펴기(레그 익스텐션)', labelEn: 'Leg extension', ids: ['seed-leg-extension', 'seed-reverse-nordic'] },
  ],
  hamstrings: [
    { key: 'hinge', labelKo: '엉덩이 접기(데드리프트류)', labelEn: 'Hip hinge', ids: ['seed-romanian-deadlift', 'seed-romanian-deadlift-dumbbell', 'seed-stiff-leg-deadlift', 'seed-band-good-morning', 'seed-smith-romanian-deadlift', 'seed-kettlebell-romanian-deadlift', 'seed-dumbbell-stiff-leg-deadlift', 'seed-smith-stiff-leg-deadlift', 'seed-cable-romanian-deadlift', 'seed-smith-good-morning'] },
    { key: 'curl', labelKo: '무릎 굽히기(레그 컬)', labelEn: 'Leg curl', ids: ['seed-lying-leg-curl', 'seed-seated-leg-curl', 'seed-nordic-curl', 'seed-standing-leg-curl', 'seed-glute-ham-raise', 'seed-dumbbell-lying-leg-curl', 'seed-band-leg-curl', 'seed-cable-standing-leg-curl', 'seed-stability-ball-leg-curl'] },
  ],
  glutes: [
    { key: 'thrust', labelKo: '밀어올리기(힙 쓰러스트·브릿지)', labelEn: 'Thrust / bridge', ids: ['seed-hip-thrust', 'seed-hip-thrust-machine', 'seed-glute-bridge', 'seed-smith-hip-thrust', 'seed-hip-thrust-dumbbell', 'seed-frog-pump', 'seed-reverse-hyperextension', 'seed-bodyweight-glute-bridge', 'seed-dumbbell-glute-bridge', 'seed-band-hip-thrust'] },
    { key: 'abduction', labelKo: '다리 벌리기/모으기', labelEn: 'Abduction', ids: ['seed-hip-abduction-machine', 'seed-hip-adduction-machine', 'seed-cable-kickback', 'seed-fire-hydrant', 'seed-clamshell', 'seed-cable-hip-abduction', 'seed-cable-hip-adduction', 'seed-lateral-leg-raise', 'seed-lateral-band-walk', 'seed-glute-kickback', 'seed-glute-kickback-machine', 'seed-bird-dog', 'seed-band-hip-abduction', 'seed-band-glute-kickback', 'seed-copenhagen-plank', 'seed-skater-jump'] }, // 대확장 @plm SRS-047
    { key: 'swing', labelKo: '스윙', labelEn: 'Swing', ids: ['seed-kettlebell-swing', 'seed-cable-pull-through', 'seed-dumbbell-swing', 'seed-band-pull-through', 'seed-kettlebell-sumo-deadlift'] },
  ],
  calves: [
    { key: 'standing', labelKo: '서서(스탠딩)', labelEn: 'Standing', ids: ['seed-standing-calf-raise', 'seed-leg-press-calf-raise', 'seed-dumbbell-calf-raise', 'seed-smith-calf-raise', 'seed-barbell-calf-raise', 'seed-bodyweight-calf-raise', 'seed-band-calf-raise', 'seed-donkey-calf-raise'] },
    { key: 'seated', labelKo: '앉아서(시티드)', labelEn: 'Seated', ids: ['seed-seated-calf-raise', 'seed-dumbbell-seated-calf-raise', 'seed-barbell-seated-calf-raise'] },
  ],
  abs: [
    { key: 'crunch', labelKo: '윗몸 말기(크런치)', labelEn: 'Crunch', ids: ['seed-crunch', 'seed-cable-crunch', 'seed-sit-up', 'seed-decline-sit-up', 'seed-ab-crunch-machine', 'seed-bicycle-crunch', 'seed-v-sit-up', 'seed-side-crunch', 'seed-decline-crunch', 'seed-toe-touch', 'seed-heel-tap', 'seed-exercise-ball-crunch'] }, // 갭 이관·대확장 @plm SRS-047
    { key: 'legraise', labelKo: '다리 들기(레그 레이즈)', labelEn: 'Leg raise', ids: ['seed-hanging-leg-raise', 'seed-reverse-crunch', 'seed-lying-leg-raise', 'seed-lying-knee-raise', 'seed-hanging-knee-raise', 'seed-parallel-bar-knee-raise', 'seed-parallel-bar-leg-raise', 'seed-toes-to-bar', 'seed-flutter-kick', 'seed-scissor-kick', 'seed-dragon-flag'] }, // 대확장 @plm SRS-047
    { key: 'twist', labelKo: '몸통 비틀기(트위스트)', labelEn: 'Rotation', ids: ['seed-russian-twist', 'seed-cable-woodchopper', 'seed-pallof-press', 'seed-landmine-180', 'seed-torso-rotation-machine', 'seed-elbow-to-knee', 'seed-side-bend', 'seed-band-pallof-press', 'seed-cable-side-bend', 'seed-band-woodchop', 'seed-kettlebell-windmill', 'seed-windshield-wiper'] },
    { key: 'plank', labelKo: '버티기(플랭크)', labelEn: 'Plank / hold', ids: ['seed-plank', 'seed-side-plank', 'seed-ab-wheel-rollout', 'seed-mountain-climber', 'seed-dead-bug', 'seed-hollow-rock', 'seed-reverse-plank', 'seed-spiderman-plank', 'seed-shoulder-taps', 'seed-l-sit-hold', 'seed-barbell-rollout'] }, // 대확장 @plm SRS-047
  ],
};

// 동작 세부질문이 없는 부위(이두·전완·승모·전신)에서 쓰는 기구 옵션. 흔한 것만.
export const FINDER_EQUIPMENTS: EquipmentType[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'];

export function muscleSubgroups(m: MuscleGroup): FinderOption[] | null {
  return FINDER_TREE[m] ?? null;
}
