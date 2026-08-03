// @plm SRS-001  계약(proto enum) ↔ 도메인 어휘(문자열) 변환
//
// ─────────────────────────────────────────────────────────────────────────────
// 두 어휘가 만나는 자리는 **여기 하나뿐이다.** 화면 라벨(lib/labels.ts)도, 서버 카탈로그를
// 로컬 저장소로 옮기는 코드(lib/catalogSync.ts)도 이 표를 쓴다 — 표가 두 벌이면 한쪽만
// 고쳐 놓고 "기구 필터는 되는데 저장은 이상한" 상태가 된다.
//
// 값이 문자 그대로 같아서(MUSCLE_CHEST ↔ 'chest') 표가 단순하다. Record<> 로 못 박아 두었으므로
// 계약에 enum 값이 늘면 **여기서 컴파일이 깨진다** — 빠뜨릴 수 없다.
//
// ── null의 의미(레거시 계승) ────────────────────────────────────────────────
// 로컬 저장소는 app이 쓰던 규약을 그대로 따른다:
//   kind      null = 근력            · 'cardio' 만 명시
//   load_mode null = 외부하중        · 'assisted' | 'bodyweight' 만 명시
// 서버 계약은 UNSPECIFIED/STRENGTH/EXTERNAL로 같은 뜻을 표현하므로, 옮길 때 null로 되돌린다.
// 이걸 어기면 같은 종목이 app과 이 스택에서 다른 행으로 보인다.
// ─────────────────────────────────────────────────────────────────────────────
import { Equipment, ExerciseKind, LoadMode, Muscle } from "@app/contracts";
import type {
  EquipmentType,
  ExerciseKind as DomainKind,
  LoadMode as DomainLoadMode,
  MuscleGroup,
} from "@app/core/domain/types";

export const MUSCLE_KEY: Record<Muscle, MuscleGroup | null> = {
  [Muscle.UNSPECIFIED]: null,
  [Muscle.CHEST]: "chest",
  [Muscle.BACK]: "back",
  [Muscle.SHOULDERS]: "shoulders",
  [Muscle.BICEPS]: "biceps",
  [Muscle.TRICEPS]: "triceps",
  [Muscle.FOREARMS]: "forearms",
  [Muscle.QUADS]: "quads",
  [Muscle.HAMSTRINGS]: "hamstrings",
  [Muscle.GLUTES]: "glutes",
  [Muscle.CALVES]: "calves",
  [Muscle.ABS]: "abs",
  [Muscle.TRAPS]: "traps",
  [Muscle.FULL_BODY]: "fullBody",
  [Muscle.OTHER]: "other",
};

export const EQUIPMENT_KEY: Record<Equipment, EquipmentType | null> = {
  [Equipment.UNSPECIFIED]: null,
  [Equipment.BARBELL]: "barbell",
  [Equipment.DUMBBELL]: "dumbbell",
  [Equipment.MACHINE]: "machine",
  [Equipment.CABLE]: "cable",
  [Equipment.BODYWEIGHT]: "bodyweight",
  [Equipment.KETTLEBELL]: "kettlebell",
  [Equipment.BAND]: "band",
  [Equipment.SMITH]: "smith",
  [Equipment.OTHER]: "other",
};

/** 계약 enum 배열 → 도메인 문자열 배열(UNSPECIFIED는 버린다). */
export const toMuscles = (in_: Muscle[]): MuscleGroup[] =>
  in_.map((m) => MUSCLE_KEY[m]).filter((m): m is MuscleGroup => m !== null);

/** 저장소가 기대하는 값 — 근력은 null이다. */
export const toDomainKind = (k: ExerciseKind): DomainKind | null =>
  k === ExerciseKind.CARDIO ? "cardio" : null;

/** 저장소가 기대하는 값 — 외부하중은 null이다. */
export const toDomainLoadMode = (l: LoadMode): DomainLoadMode | null => {
  if (l === LoadMode.ASSISTED) return "assisted";
  if (l === LoadMode.BODYWEIGHT) return "bodyweight";
  return null;
};

/** 도메인 문자열 → 계약 enum (화면 필터가 서버에 물을 때 쓴다). */
export const fromDomainEquipment = (e: EquipmentType | null): Equipment =>
  (Object.entries(EQUIPMENT_KEY).find(([, v]) => v === e)?.[0] as unknown as Equipment) ??
  Equipment.UNSPECIFIED;
