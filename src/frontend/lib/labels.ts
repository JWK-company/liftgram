// @plm SRS-001  계약 enum ↔ 도메인 어휘 ↔ 표시 라벨
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일은 **번역기이지 사전이 아니다.** 한국어 문구는 여기 없다 —
// `@app/core`(app/에서 이전해 온 도메인 계층, ADR-032)의 라벨 표가 유일한 사전이다.
//
// 처음에는 여기에 한국어 표를 손으로 적어 뒀는데, 그건 app/의 domain/labels.ts와 같은 사실을
// 두 곳에 적는 것이었다 — 종목명을 다듬는 순간 두 화면이 다른 낱말을 쓰게 된다.
// (카탈로그 시드를 생성물로 둔 것과 같은 이유다)
//
// 여기 남는 일은 **계약(proto enum) ↔ 도메인(문자열)** 을 잇는 것뿐이다.
// 계약에 값이 늘면 아래 표에서 컴파일이 깨지고, 도메인 어휘가 바뀌면 타입이 깨진다.
// ─────────────────────────────────────────────────────────────────────────────
import { Equipment, ExerciseKind, LoadMode, Muscle } from "@app/contracts";
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from "@app/core/domain/labels";
import type { EquipmentType, MuscleGroup } from "@app/core/domain/types";
import { EQUIPMENT_KEY, MUSCLE_KEY } from "@/lib/contractMap";

/** 화면 언어. 지금은 한국어 고정 — 언어 전환은 i18n 계층을 옮길 때 붙인다. */
const LANG = "ko" as const;

// ── 표시 라벨 ────────────────────────────────────────────────────────────────
// 계약 enum → 도메인 어휘 변환은 lib/contractMap.ts 한 곳에만 둔다(동기화 코드와 공유).
// 여기서는 도메인 어휘 → 한국어만 한다.

export const muscleLabel = (m: Muscle): string => {
  const key: MuscleGroup | null = MUSCLE_KEY[m];
  return key ? MUSCLE_LABELS[LANG][key] : "-";
};

export const equipmentLabel = (e: Equipment): string => {
  const key: EquipmentType | null = EQUIPMENT_KEY[e];
  return key ? EQUIPMENT_LABELS[LANG][key] : "-";
};

/** 도메인 문자열을 그대로 받는 화면(로컬 저장소를 읽는 목록)이 쓴다. */
export const muscleLabelFromDomain = (m: MuscleGroup): string => MUSCLE_LABELS[LANG][m] ?? "기타";
export const equipmentLabelFromDomain = (e: EquipmentType): string => EQUIPMENT_LABELS[LANG][e] ?? "기타";

// 종류·하중모드는 도메인에 표시 라벨이 없다(계산에만 쓰이는 축이라 app도 화면에서 직접 쓴다).
// 여기 두되, 표가 커지면 도메인으로 올려 app과 공유한다.
const KIND: Record<ExerciseKind, string> = {
  [ExerciseKind.UNSPECIFIED]: "근력",
  [ExerciseKind.STRENGTH]: "근력",
  [ExerciseKind.CARDIO]: "유산소",
};

const LOAD_MODE: Record<LoadMode, string> = {
  [LoadMode.UNSPECIFIED]: "외부하중",
  [LoadMode.EXTERNAL]: "외부하중",
  [LoadMode.ASSISTED]: "어시스트(체중−무게)",
  [LoadMode.BODYWEIGHT]: "맨몸(체중+무게)",
};

export const kindLabel = (k: ExerciseKind) => KIND[k] ?? "근력";
export const loadModeLabel = (l: LoadMode) => LOAD_MODE[l] ?? "외부하중";

/** 필터 UI가 도는 목록 — UNSPECIFIED(=필터 없음)는 뺀다. */
export const EQUIPMENT_OPTIONS = Object.values(Equipment).filter(
  (v): v is Equipment => typeof v === "number" && v !== Equipment.UNSPECIFIED,
);

export const MUSCLE_OPTIONS = Object.values(Muscle).filter(
  (v): v is Muscle => typeof v === "number" && v !== Muscle.UNSPECIFIED,
);
