"use client";
// @plm SRS-004  종목 블록 — app의 features/session/ExerciseBlock.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 세션에서 종목 하나가 차지하는 카드. 위에서 아래로:
//
//   헤더        ▲▼ · 종목명 · 상세 · 슈퍼셋 · 교체 · 삭제
//   메타 칩     기구 변형 · 슈퍼셋 배지 · **PR** · 이 종목 볼륨 · 체중 미설정 경고
//   팁 패널     운동 방법(2컷 시연 ↔ 단계 설명)
//   표 머리     세트 · 이전 · 무게 · 횟수
//   세트 줄들
//   세트 추가 · 메모 · 지난 메모 · 메모 이력 · 휴식 시간
//
// ── 여기서 계산하지 않는 것 ─────────────────────────────────────────────────
// 볼륨·PR·이전기록·제안 무게는 **전부 저장소와 도메인이 한다**(ADR-032). 이 파일은 그 결과를
// 배치할 뿐이다. 어시스트/맨몸의 유효무게 같은 규칙이 화면으로 새면 app과 갈라진다.
//
// ── 반응형 쿼리의 빈틈 ──────────────────────────────────────────────────────
// WatermelonDB의 관찰은 **행이 늘고 주는 것**은 알려 주지만 필드 수정은 알려 주지 않는다.
// 그래서 볼륨처럼 값이 바뀌어야 다시 그려야 하는 것은 app과 같이 1.5초 폴링으로 따라간다.
// ─────────────────────────────────────────────────────────────────────────────
import {
  blockLoadMultiplier,
  canonicalVariantKey,
  parseVariantKey,
  variantLabelFromKey,
  type SlotSummary,
  effectiveWeightKg,
  formatEnteredWeight,
  formatWeight,
  resolveLoadMode,
  restSecondsForSetType,
  suggestNextSetWeightKg,
  type EquipmentType,
  type VariantDims,
  type WeightUnit,
  cardioMetricsFor,
  formatDistanceKm,
  formatDurationClock,
  sumCardio,
  type CardioMetric,
} from "@app/core";
import { carryWeightAcrossMultiplier } from "@app/core/domain/recordSlots";
import { firstOpenWorkingSet } from "@app/core/domain/supersetRound";
import { useToast } from "../Toast";
// import { getExerciseMedia } from "@app/core/data/exerciseMedia"; // [원본] P5: 팁 유무는 hasPictogram, 사진 표는 팁 패널이 펼칠 때 불러온다
import { hasPictogram } from "@app/core/data/exerciseVisual";
import { useQueryData } from "@app/core/db/hooks";
import { useUser } from "@app/core/state/userContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lang, t } from "@/lib/i18n";
import { firePrCelebration } from "../PrCelebration";
import { Button } from "../ui/Button";
import { ConfirmDialog, SheetShell } from "../ui/Dialog";
import { MoreMenu } from "../ui/MoreMenu";
import { navigate } from "@/lib/nav";
import { IconButton } from "../ui/IconButton";
import { NumberStepper } from "../ui/inputs";
import { AppText, Card, Tag } from "../ui/primitives";
// [원본] import { VariantSelector } from "../ui/VariantSelector";
import { RecordSlotSelector } from "../ui/RecordSlotSelector";
import { UnitToggle } from "../ui/UnitToggle";
import { useExerciseName } from "@/lib/exerciseNames";
import { ExerciseName } from "./ExerciseName";
import { Pictogram } from "../Pictogram";
import { ExerciseTipPanel } from "./ExerciseTipPanel";
import { NoteHistoryPanel } from "./NoteHistoryPanel";
import { CARDIO_COL_LABEL, SetRowCardio } from "./SetRowCardio";
import { SetRowEdit, type PrevSet, type SetRow, type Suggestion } from "./SetRowEdit";

type WorkoutRepo = typeof import("@app/core/data/workoutRepository");

/** 이 블록이 모델에서 읽는 것만. */
export interface WorkoutExerciseRow {
  id: string;
  exerciseId: string;
  supersetGroup: string | null;
  restSeconds: number | null;
  note: string | null;
  variant: VariantDims | null;
  /** v25 이 블록의 무게 단위(null = 아직 안 정함 → kg/칸 기억) @plm SRS-067 */
  weightUnit?: "kg" | "lb" | null;
  prescription:
    | { repMin?: number | null; repMax?: number | null; loadBasis?: string; loadPct?: number }[]
    | null;
}

export function ExerciseBlock({
  we,
  repo,
  unit,
  barWeightKg,
  bodyweightKg,
  onStartRest,
  onSwap,
  onSwapTo,
  onMoveUp,
  onMoveDown,
  onSuperset,
  onUnsuperset,
  canSuperset,
  insideSuperset,
  onChanged,
  onRoundToggle,
}: {
  we: WorkoutExerciseRow;
  repo: WorkoutRepo;
  unit: WeightUnit;
  barWeightKg: number;
  bodyweightKg: number | null;
  onStartRest: (seconds: number) => void;
  onSwap?: (weId: string) => void;
  /** 같은 동작의 다른 기구 종목으로 곧바로 바꾼다(기구 바꾸기 — 피커 없이) @plm SRS-057 */
  onSwapTo?: (weId: string, exerciseId: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onSuperset?: () => void;
  onUnsuperset?: () => void;
  canSuperset?: boolean;
  insideSuperset?: boolean;
  onChanged: () => Promise<void>;
  /**
   * 슈퍼셋 묶음 함께 완료(#48) — 있으면 세트 체크 한 번이 묶음의 같은 번호 세트를 함께 바꾼다(묶음이 저장·PR 축하).
   * 이 블록은 휴식(1회)·다음 세트 제안만 맡는다. 길게 누르기는 이 종목만(기존 단일 토글). @plm SRS-062
   */
  onRoundToggle?: (
    setNumber: number,
    next: boolean,
    setId: string,
    kg: number | undefined, // 읽을 수 없는 입력은 undefined — 저장하지 않는다(/qa code M4)
    reps: number | undefined,
  ) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [prevSets, setPrevSets] = useState<PrevSet[]>([]);
  // [원본] 중량 PR 한 줄만 들고 있었다
  // const [pr, setPr] = useState<{ weightKg: number; reps: number } | null>(null);
  // [개선] 중량 PR·볼륨 PR 을 출처 세트까지(#50·#51) @plm SRS-061
  const [prs, setPrs] = useState<Awaited<ReturnType<WorkoutRepo["getExercisePRs"]>>>({
    weight: null,
    volume: null,
  });
  const pr = prs.weight;
  const toast = useToast();
  // 처방 무게 근거(세트 id → 문구) — 탑셋을 마친 뒤 채운 세트(SRS-063)
  const [loadNotes, setLoadNotes] = useState<Record<string, string>>({});
  const [prevCleared, setPrevCleared] = useState(false);
  const [loadMode, setLoadMode] = useState<"external" | "assisted" | "bodyweight">("external");
  const [baseEquipment, setBaseEquipment] = useState<EquipmentType | null>(null);
  const [isCardio, setIsCardio] = useState(false);
  // 종목마다 기록하는 지표가 다르다(러닝머신=경사·속도, 계단=단계, 줄넘기=시간만) — 도메인이 정한다.
  const [cardioMetrics, setCardioMetrics] = useState<CardioMetric[]>(["duration", "distance"]);
  // [원본] const [exName, setExName] = useState<string | null>(null);
  // [P3] 표시 이름(내가 부르는 이름) — PR 축하·팁 제목이 블록 이름과 같게 @plm SRS-056
  const exName = useExerciseName(we.exerciseId);
  const [variant, setVariant] = useState<VariantDims>(() => we.variant ?? {});
  const [restSeconds, setRestSeconds] = useState(we.restSeconds ?? 120);
  const [note, setNote] = useState(we.note ?? "");
  const [prevNote, setPrevNote] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [confirmRemove, setConfirmRemove] = useState(false);
  // 메모·휴식 시간은 종목 ⋯ 안의 설정이다(SRS-054) — 입력칸이 늘 펼쳐져 세트 표를 밀어내지 않게.
  // 메모는 써 둔 것이 있으면 처음부터 보인다.
  const [noteOpen, setNoteOpen] = useState(() => !!we.note?.trim());
  const [restSheet, setRestSheet] = useState(false);
  const [volTick, setVolTick] = useState(0);
  // ── 기록 칸(조합) — 플레이트 한쪽 입력 · 다른 조합 기록(ADR-034 · ADR-037) @plm SRS-058 ──
  const { machineVariantLabels } = useUser();
  const [plateOneSide, setPlateOneSideState] = useState(false);
  const [slots, setSlots] = useState<SlotSummary[]>([]);
  const [slotsOpen, setSlotsOpen] = useState(false);

  // ── 블록 무게 단위(kg|lb) — 한 헬스장에 kg·lb 기구가 섞여 있다(2026-10-27) @plm SRS-067 ──
  // 기본값 = 같은 종목·칸으로 마지막에 완료한 블록의 단위(저장소가 정한다 · 환산 없음). 토글은 숫자 유지·단위만(Q4 B).
  // 블록 안의 무게(머리·입력·이전 기록·PR·제안)는 이 단위, **볼륨은 kg**(Q2 A).
  // `unit` prop 은 이제 「정하기 전 잠깐」의 자리값일 뿐이다.
  const [blockUnit, setBlockUnit] = useState<WeightUnit>(() =>
    we.weightUnit === "lb" ? "lb" : we.weightUnit === "kg" ? "kg" : unit,
  );
  useEffect(() => {
    let alive = true;
    void repo
      .ensureBlockUnit(we.id)
      .then((u) => {
        if (alive) setBlockUnit(u);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [repo, we.id]);

  // 종목이 바뀌면(기구 바꾸기·대체) 저장소가 새 종목의 지난 조합을 승계해 둔다 — 그 값을 다시 따른다.
  // [원본] 종목이 바뀔 때만 따라갔다 — 그래서 고른 직후 저장소가 칸을 정하면(별칭 「로프 푸시다운」 → 로프 · P3) 화면이 몰랐다
  // useEffect(() => setVariant(we.variant ?? {}), [we.exerciseId]);
  // [개선] 저장된 칸(키)이 바뀌어도 따른다. 같은 종목에서 사람이 고른 값은 곧 같은 키로 저장되므로 되돌리지 않는다. @plm SRS-056
  const storedVariantKey = canonicalVariantKey(we.variant ?? {});
  // biome-ignore lint/correctness/useExhaustiveDependencies: 종목·저장된 칸이 바뀔 때만 따라간다(그 사이 선택은 위 상태가 정본)
  useEffect(() => setVariant(we.variant ?? {}), [we.exerciseId, storedVariantKey]);

  const variantKey = useMemo(() => canonicalVariantKey(variant), [variant]);

  // 종목이 바뀌면(기구 바꾸기·대체) 완료 세트가 없을 때 새 종목·칸이 기억하는 단위로(환산 없음) @plm SRS-067
  const firstExercise = useRef(we.exerciseId);
  useEffect(() => {
    if (firstExercise.current === we.exerciseId) return;
    firstExercise.current = we.exerciseId;
    let alive = true;
    void repo
      .adoptSlotUnit(we.id)
      .then((u) => {
        if (alive) setBlockUnit(u);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [repo, we.id, we.exerciseId]);

  /** 사람이 누른 토글(Q4 B) — 이 블록 세트의 숫자는 그대로, 단위만. 다시 누르면 정확히 원래로. */
  const switchUnit = (to: WeightUnit) => {
    if (to === blockUnit) return;
    setBlockUnit(to);
    void write(() => repo.switchBlockWeightUnit(we.id, to))
      .then(() => toast(t("session.unitSwitched", { unit: to })))
      .catch(() => setBlockUnit(blockUnit));
  };

  // ── 종목 자체의 성질(기구·유산소·하중 모드) ──
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const exRepo = await import("@app/core/data/exerciseRepository");
        const e = (await exRepo.getExercise(we.exerciseId)) as unknown as {
          equipment: EquipmentType;
          kind: string | null;
          nameKo: string;
          nameEn: string | null;
        };
        if (!alive) return;
        setBaseEquipment(e.equipment);
        setIsCardio(e.kind === "cardio");
        setCardioMetrics(cardioMetricsFor({ nameEn: e.nameEn }));
        // [원본] setExName(e.nameKo);
        setLoadMode(resolveLoadMode(e as Parameters<typeof resolveLoadMode>[0]));
      } catch {
        // 삭제된 종목 — 기본값으로 둔다.
      }
    })();
    return () => {
      alive = false;
    };
  }, [we.exerciseId]);

  // ── 이전 기록 · PR · 지난 메모 — 변형을 바꾸면 **버킷이 바뀌므로 전부 다시 읽는다** ──
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [sets, best, pnote] = await Promise.all([
        repo.getPreviousExerciseSets(we.exerciseId, variantKey).catch(() => []),
        // [원본] repo.getExercisePR(we.exerciseId, variantKey).catch(() => null),
        repo.getExercisePRs(we.exerciseId, variantKey).catch(() => ({ weight: null, volume: null })), // @plm SRS-061
        repo.getPreviousExerciseNote(we.exerciseId, variantKey).catch(() => null),
      ]);
      if (!alive) return;
      setPrevSets(sets as PrevSet[]);
      // [원본] setPr(best);
      setPrs(best);
      setPrevNote(pnote);
      setPrevCleared(false);
    })();
    return () => {
      alive = false;
    };
  }, [repo, we.exerciseId, variantKey]);

  // 한쪽 입력 선호(사용자 × 종목) — 종목이 바뀌면 다시 읽는다
  useEffect(() => {
    let alive = true;
    void import("@app/core/data/exercisePrefs").then(async (m) => {
      const on = await m.getPlateOneSide(we.exerciseId);
      if (alive) setPlateOneSideState(on);
    });
    return () => {
      alive = false;
    };
  }, [we.exerciseId]);

  // 조합별 기록(이 종목을 어떤 칸으로 해 왔나) — 「이전 기록 · 로프」와 「다른 조합 기록 보기」의 재료
  useEffect(() => {
    let alive = true;
    void repo
      .getExerciseSlotSummaries(we.exerciseId)
      .then((list) => {
        if (alive) setSlots(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [repo, we.exerciseId]);

  const oneSide = blockLoadMultiplier(variant, plateOneSide) === 2;
  const otherSlots = slots.filter((x) => (x.variantKey ?? null) !== (variantKey ?? null));

  // ── 세트 목록(반응형) ──
  const models = useQueryData(() => repo.querySetLogs(we.id), [repo, we.id]);
  // `volTick`이 의존에 있는 것은 의도다 — 관찰은 **행의 증감**만 알리므로, 무게·완료 같은 **필드 변경**은
  // 주기적으로 다시 읽어야 화면에 반영된다(app도 같은 이유로 1.5초 폴링을 쓴다).
  // biome-ignore lint/correctness/useExhaustiveDependencies: 필드 변경을 따라잡기 위한 의도적 의존
  const sets: SetRow[] = useMemo(() => models.map((m) => m as unknown as SetRow), [models, volTick]);

  useEffect(() => {
    const iv = setInterval(() => setVolTick((v) => v + 1), 1500);
    return () => clearInterval(iv);
  }, []);

  /** 이 종목의 볼륨 — 완료한 워킹 세트만 센다(워밍업·실패 제외). 도메인의 유효무게 규칙을 쓴다. */
  const exVol = useMemo(() => {
    let volume = 0;
    let reps = 0;
    for (const s of sets) {
      if (!s.done || s.isWarmup || s.isFailed) continue;
      const w = effectiveWeightKg({
        weightKg: s.weightKg,
        reps: s.reps,
        loadMode,
        bodyweightKg: bodyweightKg ?? undefined,
        loadMultiplier: s.loadMultiplier, // v22: 플레이트 한쪽 입력 배수(null=1) @plm SRS-058
      } as Parameters<typeof effectiveWeightKg>[0]);
      volume += w * s.reps;
      reps += s.reps;
    }
    return { volume, reps };
  }, [sets, loadMode, bodyweightKg]);

  /** 표시 순번 — 일반 세트만 번호가 오르고, 나머지는 W/D/F/T. app의 규칙 그대로다. */
  const labels = useMemo(() => {
    let normal = 0;
    return sets.map((s) => {
      if (s.isWarmup) return { label: "W", color: "pr" as const };
      if (s.isDrop === true) return { label: "D", color: "primary" as const };
      if (s.isFailed) return { label: "F", color: "danger" as const };
      if (s.setType === "top") return { label: "T", color: "textMuted" as const };
      normal += 1;
      return { label: String(normal), color: "textMuted" as const };
    });
  }, [sets]);

  const shownPrev = prevCleared ? [] : prevSets;

  /**
   * 유산소 합계 — **체크하지 않은 세트는 빼지 않는다**(`done !== false`).
   * 예전 레코드에는 `done`이 아예 없어서, 없는 것을 "안 한 것"으로 보면 옛 기록이 0이 된다.
   */
  const cardioTotal = (() => {
    if (!isCardio) return "";
    const { durationSec, distanceM } = sumCardio(sets.filter((s) => s.done !== false));
    const parts: string[] = [];
    if (durationSec > 0) parts.push(formatDurationClock(durationSec));
    if (distanceM > 0) parts.push(formatDistanceKm(distanceM));
    return parts.join(" · ");
  })();
  const hasPrev = prevSets.length > 0 || pr !== null || (!!prevNote && prevNote !== note.trim());
  // [원본] const hasTip = !isCardio && !!getExerciseMedia(we.exerciseId); // P2: 미디어는 종목 id 로 찾는다(ADR-033)
  // [P5] 시드 종목은 사진이 없어도 픽토그램 움직임이 있다(ADR-036) @plm SRS-055
  // 사진·설명 표의 키는 전부 시드 종목이다 — 시드 종목이면 팁이 있다(사진 표 672KB 를 이 화면에서 미리 싣지 않는다)
  const hasTip = !isCardio && hasPictogram(we.exerciseId);
  const bwRelative = loadMode === "assisted" || loadMode === "bodyweight";
  const bwMissing = bwRelative && bodyweightKg == null;

  const write = useCallback(
    async (fn: () => Promise<unknown>) => {
      await fn();
      await onChanged();
    },
    [onChanged],
  );

  const addSet = () =>
    void (async () => {
      setBusy(true);
      try {
        await write(() => repo.addSet(we.id, { cardio: isCardio, bodyweight: loadMode === "bodyweight" }));
      } finally {
        setBusy(false);
      }
    })();

  /**
   * 세트를 체크했을 때 — 휴식을 걸고, PR을 판정하고, 다음 세트 무게를 제안한다.
   *
   * 무게·횟수는 **화면 입력값**을 그대로 받는다(저장 커밋과 경합해 옛 값으로 PR을 판정하면 놓친다).
   */
  const onToggleDone =
    (s: SetRow, single = false) =>
    (next: boolean, uiKg: number | undefined, uiReps: number | undefined) =>
      void (async () => {
        // 화면 값을 읽을 수 없으면 저장된 값으로 판정·계산한다(묶음 저장은 undefined 를 쓰지 않는다 · M4)
        const kg = uiKg ?? s.weightKg;
        const reps = uiReps ?? s.reps;
        // [원본] await write(() => repo.setSetDone(s.id, next));
        // [개선] 슈퍼셋 안이면 묶음 전체의 같은 번호 세트를 함께(#48) — 길게 누르기(single)는 이 종목만 @plm SRS-062
        const grouped = !!onRoundToggle && !single;
        if (grouped) await write(() => onRoundToggle(s.setNumber, next, s.id, uiKg, uiReps));
        else await write(() => repo.setSetDone(s.id, next));
        if (!next) return;

        // 휴식은 세트 타입이 정한다 — 웜업은 짧게, 탑세트는 길게(처방이 없으면 종목 설정값).
        onStartRest(
          restSecondsForSetType(s.setType as Parameters<typeof restSecondsForSetType>[0], restSeconds),
        );

        // 묶음 완료는 PR 축하를 묶음이 모아서 한 번 한다(QA Q6)
        if (!grouped) {
          try {
            const livePrs = await repo.evalLiveSetPr(we.id, s.id, kg, reps);
            if (livePrs.length && exName)
              firePrCelebration({ exerciseName: exName, types: livePrs.map((p) => p.type) });
          } catch {
            // PR 판정이 실패해도 기록은 남는다 — 축하만 건너뛴다.
          }
        }

        // 처방 무게 기준(#56) — 탑셋을 마치면 백오프(탑셋의 N%), 기록이 없던 「1RM 의 N%」를 채운다.
        // 사람이 이미 고친 세트는 저장소가 건너뛴다(QA Q5). 채운 세트는 제안 칩 대신 근거를 보인다. @plm SRS-063
        let filledIds = new Set<string>();
        if (kg > 0) {
          try {
            const filled = await repo.fillPrescribedLoadsAfter(we.id, s.id, kg, reps);
            if (filled.length) {
              filledIds = new Set(filled.map((f) => f.setLogId));
              setLoadNotes((m) => {
                const nextNotes = { ...m };
                for (const f of filled) {
                  nextNotes[f.setLogId] = t(f.reasonKey as Parameters<typeof t>[0], {
                    base: formatEnteredWeight(f.params.base ?? 0, blockUnit),
                    pct: f.params.pct ?? 0,
                  });
                }
                return nextNotes;
              });
              await onChanged();
            }
          } catch {
            // 채우지 못해도 기록은 남는다 — 아래 제안 칩이 남는다.
          }
        }

        // 다음 처방 세트가 있으면 무게를 권한다(웜업 사다리·탑→백오프 비율은 도메인이 안다).
        if (kg > 0) {
          const idx = sets.findIndex((x) => x.id === s.id);
          const nextSet = sets.slice(idx + 1).find((x) => !x.done && x.setType != null);
          if (nextSet && !filledIds.has(nextSet.id)) {
            const sug = suggestNextSetWeightKg({
              prevWeightKg: kg,
              prevType: s.setType as Parameters<typeof suggestNextSetWeightKg>[0]["prevType"],
              nextType: nextSet.setType as Parameters<typeof suggestNextSetWeightKg>[0]["nextType"],
            });
            if (sug) setSuggestions((m) => ({ ...m, [nextSet.id]: sug }));
          }
        }
      })();

  type PrRef = NonNullable<typeof prs.weight>;
  /** 보일 PR 칩 — 중량·볼륨이 같은 세트면 하나로. */
  function prChips(): { kind: "weight" | "volume" | "both"; label: string; ref: PrRef }[] {
    const w = prs.weight;
    const v = prs.volume;
    // [원본] const fmt = (r: PrRef) => ({ weight: formatWeight(r.effectiveKg, unit), reps: r.reps });
    // [개선] 블록 단위 · 적은 숫자 그대로(증분 반올림 없음 — /qa spec Q2) @plm SRS-067
    const fmt = (r: PrRef) => ({ weight: formatEnteredWeight(r.effectiveKg, blockUnit), reps: r.reps });
    if (w && v && w.setLogId === v.setLogId)
      return [{ kind: "both", label: t("session.prBothChip", fmt(w)), ref: w }];
    const out: { kind: "weight" | "volume" | "both"; label: string; ref: PrRef }[] = [];
    if (w) out.push({ kind: "weight", label: t("session.prWeightChip", fmt(w)), ref: w });
    if (v) out.push({ kind: "volume", label: t("session.prVolumeChip", fmt(v)), ref: v });
    return out;
  }
  /** PR 칩을 누르면 — 아직 안 한 첫 세트 하나에 그 무게·횟수(#50 A). 한쪽 입력 블록이면 입력 방식대로 환산. */
  function fillFromPr(ref: PrRef) {
    // [원본] const target = sets.find((x) => x.done !== true);
    // [개선] 워밍업 칸이 아니라 첫 「작업」 세트에(/qa code L1) — 작업 세트가 없으면 첫 미완료 @plm SRS-061
    const target = firstOpenWorkingSet(sets);
    if (!target) {
      toast(t("session.prNoOpenSet"));
      return;
    }
    const weightKg = carryWeightAcrossMultiplier(
      ref.inputWeightKg,
      ref.loadMultiplier,
      blockLoadMultiplier(variant, plateOneSide),
    );
    void write(() => repo.updateSetLog(target.id, { weightKg, reps: ref.reps })).then(() =>
      toast(t("session.prFilled", { weight: formatEnteredWeight(weightKg, blockUnit), reps: ref.reps })),
    );
  }

  const prevClearBtn =
    !isCardio && (hasPrev || prevCleared) ? (
      <button
        type="button"
        data-testid="prev-clear"
        onClick={() => setPrevCleared((v) => !v)}
        className="py-[2px]"
      >
        <AppText variant="label" color="textFaint">
          {prevCleared ? t("session.showPrev") : t("session.clearPrev")}
        </AppText>
      </button>
    ) : undefined;

  return (
    <Card
      className={
        insideSuperset ? "border-0! bg-transparent! p-0! py-[var(--spacing-sm)]!" : "mb-[var(--spacing-lg)]"
      }
    >
      <div data-testid={`we-${we.id}`}>
        {/* 헤더 */}
        <div className="flex items-start">
          {onMoveUp || onMoveDown ? (
            <div className="mr-[2px] flex w-[30px] shrink-0 flex-col gap-[2px]">
              <IconButton
                icon="chevron-up"
                size={20}
                label={t("session.moveUp")}
                disabled={!onMoveUp}
                color={onMoveUp ? "var(--color-ink2)" : "var(--color-line)"}
                onPress={onMoveUp}
                className="h-6! w-[30px]!"
              />
              <IconButton
                icon="chevron-down"
                size={20}
                label={t("session.moveDown")}
                disabled={!onMoveDown}
                color={onMoveDown ? "var(--color-ink2)" : "var(--color-line)"}
                onPress={onMoveDown}
                className="h-6! w-[30px]!"
              />
            </div>
          ) : null}

          {/* P5: 종목 그림(정지) — 이름만으로 헷갈리는 종목을 한눈에(피드백 #8) @plm SRS-055 */}
          {hasPictogram(we.exerciseId) ? (
            <span className="h-9 w-11 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-(--color-surface-alt)">
              <Pictogram exerciseId={we.exerciseId} className="h-full w-full" testId="we-picto" />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <ExerciseName exerciseId={we.exerciseId} variant="heading" base revealOnTap testId="we-name" />
          </div>

          {/* 종목 동작은 ⋯ 하나로(아이콘 셋 → 하나 · SRS-054). 표식(btn-superset·btn-swap·btn-remove-exercise)은 시트 안 선택지가 잇는다. */}
          <MoreMenu
            vertical
            testId="btn-we-menu"
            title={exName ?? ""}
            options={[
              {
                label: t("nav.exerciseDetail"),
                testId: "btn-we-info",
                onPress: () => navigate(`/exercise/${we.exerciseId}`),
              },
              ...(!insideSuperset && canSuperset && (onSuperset || onUnsuperset)
                ? [
                    {
                      label: we.supersetGroup ? t("session.supersetUnlink") : t("session.superset"),
                      testId: "btn-superset",
                      onPress: () => (we.supersetGroup ? onUnsuperset?.() : onSuperset?.()),
                    },
                  ]
                : []),
              ...(onSwap
                ? [{ label: t("routines.swap"), testId: "btn-swap", onPress: () => onSwap(we.id) }]
                : []),
              {
                label: `${t("session.restTime")} · ${restSeconds}${t("session.secondsSuffix")}`,
                testId: "btn-rest-setting",
                onPress: () => setRestSheet(true),
              },
              ...(noteOpen
                ? []
                : [
                    {
                      label: t("session.notePlaceholder"),
                      testId: "btn-note-open",
                      onPress: () => setNoteOpen(true),
                    },
                  ]),
              {
                label: t("session.removeExerciseTitle"),
                destructive: true,
                testId: "btn-remove-exercise",
                onPress: () => setConfirmRemove(true),
              },
            ]}
          />
        </div>

        {/* 메타 칩 — 변형 · 슈퍼셋 · PR · 볼륨 · 경고 */}
        <div className="mt-[4px] flex flex-wrap items-center gap-[var(--spacing-sm)]">
          {!isCardio ? (
            // [원본] 기구 칩이 같은 종목의 변형 칸이던 선택기 — P2 에서 기구 바꾸기 = 종목 바꾸기(ADR-033·034)
            // <VariantSelector baseEquipment={baseEquipment} value={variant} onChange={...} />
            <RecordSlotSelector
              exerciseId={we.exerciseId}
              baseEquipment={baseEquipment}
              value={variant}
              onChange={(dims) => {
                setVariant(dims);
                // [원본] void write(() => repo.setVariant(we.id, dims));
                // [개선] 칸이 바뀌면 그 칸이 기억하는 단위로(완료 세트가 없을 때만 · 환산 없음) @plm SRS-067
                void write(() => repo.setVariant(we.id, dims)).then(() =>
                  repo
                    .adoptSlotUnit(we.id)
                    .then(setBlockUnit)
                    .catch(() => {}),
                );
              }}
              onSwap={onSwapTo ? (exerciseId) => onSwapTo(we.id, exerciseId) : undefined}
              plateOneSide={plateOneSide}
              onPlateOneSide={(on) => {
                setPlateOneSideState(on);
                void write(() => repo.setPlateOneSideForExercise(we.exerciseId, on));
              }}
            />
          ) : null}

          {we.supersetGroup && !insideSuperset ? <Tag label={t("session.superset")} tone="primary" /> : null}

          {/* [원본] PR 한 줄(중량만, 누를 수 없음)
          {!isCardio && pr && !prevCleared ? (
            <AppText variant="caption" color="pr" data-testid="pr-chip">
              {t("session.prLine", { weight: formatWeight(pr.weightKg, unit), reps: pr.reps })}
            </AppText>
          ) : null} */}
          {/* [개선] 중량 PR·볼륨 PR 칩 — 누르면 아직 안 한 첫 세트에 채운다 · ⓘ 는 그 기록으로(#50·#51) @plm SRS-061 */}
          {!isCardio && !prevCleared && (prs.weight || prs.volume)
            ? prChips().map((c) => (
                <span key={c.kind} className="inline-flex items-center gap-[2px]">
                  <button
                    type="button"
                    data-testid={`pr-chip-${c.kind}`}
                    aria-label={`${c.label} — ${t("session.prChipFill")}`}
                    onClick={() => fillFromPr(c.ref)}
                    className="rounded-[var(--radius-pill)] border border-(--color-pr) px-[var(--spacing-sm)] py-[2px]"
                  >
                    <AppText variant="caption" color="pr" className="font-semibold">
                      {c.label}
                    </AppText>
                  </button>
                  <IconButton
                    icon="information-circle-outline"
                    size={16}
                    label={t("session.prChipHistory")}
                    color="var(--color-ink3)"
                    className="h-7! w-7!"
                    testId={`pr-chip-${c.kind}-history`}
                    onPress={() => navigate(`/history/${c.ref.workoutId}?set=${c.ref.setLogId}`)}
                  />
                </span>
              ))
            : null}

          {/* kg/lb 토글 — PR 칩 옆(2026-10-27 사용자). 맨몸·유산소는 무게 단위가 없다. @plm SRS-067 */}
          {!isCardio && loadMode === "external" ? (
            <UnitToggle value={blockUnit} onChange={switchUnit} />
          ) : null}

          {!isCardio && (exVol.volume > 0 || exVol.reps > 0) ? (
            <Tag
              tone="primary"
              label={
                exVol.volume > 0
                  ? t("session.exVolume", { volume: formatWeight(exVol.volume, "kg") }) // 볼륨은 kg(Q2 A) @plm SRS-067
                  : t("session.exTotalReps", { reps: exVol.reps })
              }
            />
          ) : null}

          {/* 유산소는 볼륨 대신 총 시간·거리를 보여 준다 — 무게·횟수가 없으니 볼륨 칩은 늘 0이다. */}
          {isCardio && cardioTotal ? (
            <Tag tone="primary" label={t("session.cardioTotal", { total: cardioTotal })} />
          ) : null}

          {bwMissing ? (
            <AppText variant="label" color="warning">
              {t("session.bodyweightNeeded")}
            </AppText>
          ) : null}

          {!hasTip ? prevClearBtn : null}
        </div>

        {/* 이전 기록이 어느 조합의 것인지 — 기본 칸이 아니거나 다른 조합 기록이 있을 때만(ADR-034) @plm SRS-058 */}
        {!isCardio && (variantKey || otherSlots.length > 0) ? (
          <div
            className="mt-[4px] flex flex-wrap items-center gap-x-[var(--spacing-sm)]"
            data-testid="slot-line"
          >
            <AppText variant="label" color="textFaint" data-testid="prev-slot">
              {t("session.prevSlot", { slot: variantLabelFromKey(variantKey, lang, machineVariantLabels) })}
            </AppText>
            {otherSlots.length > 0 ? (
              <button
                type="button"
                data-testid="btn-other-slots"
                onClick={() => setSlotsOpen(true)}
                className="py-[2px]"
              >
                <AppText variant="label" color="primary">
                  {t("session.otherSlots")} ({otherSlots.length})
                </AppText>
              </button>
            ) : null}
          </div>
        ) : null}

        {!isCardio ? (
          <ExerciseTipPanel exerciseId={we.exerciseId} trailing={hasTip ? prevClearBtn : undefined} />
        ) : null}

        {/* 표 머리 */}
        <div className="mt-[var(--spacing-md)] flex gap-[4px] pb-[4px]">
          <HeadCell className="w-[34px]">{t("session.setColHeader")}</HeadCell>
          <HeadCell className="w-[66px]">{t("session.prevColHeader")}</HeadCell>
          {isCardio ? (
            cardioMetrics.map((m) => (
              <HeadCell key={m} className="flex-1">
                {t(CARDIO_COL_LABEL[m])}
              </HeadCell>
            ))
          ) : (
            <>
              <HeadCell className="flex-1">
                {loadMode === "assisted"
                  ? t("session.assistColHeader")
                  : loadMode === "bodyweight"
                    ? t("session.addedColHeader")
                    : oneSide
                      ? t("session.weightOneSideLabel", { weightUnit: blockUnit }) // 플레이트 한쪽 입력(ADR-037)
                      : t("session.weightLabel", { weightUnit: blockUnit })}
              </HeadCell>
              <HeadCell className="flex-1">{t("session.repsLabel")}</HeadCell>
            </>
          )}
          <span className="w-[38px] shrink-0" />
          <span className="w-[34px] shrink-0" />
        </div>

        <div data-testid="set-list">
          {sets.map((s, i) =>
            isCardio ? (
              <SetRowCardio
                key={s.id}
                set={s}
                label={String(i + 1)}
                prev={shownPrev[i] ?? null}
                metrics={cardioMetrics}
                onUpdate={(patch: Record<string, number | null>) =>
                  void write(() => repo.updateSetLog(s.id, patch))
                }
                // 유산소에는 무게·횟수가 없다 — 완료 표시만 넘긴다(휴식은 같은 규칙으로 시작된다).
                onToggleDone={() => onToggleDone(s)(!(s.done === true), 0, 0)}
                onDelete={() => void write(() => repo.deleteSetLog(s.id))}
              />
            ) : (
              <SetRowEdit
                key={s.id}
                set={s}
                label={labels[i].label}
                labelColor={labels[i].color}
                prev={shownPrev[i] ?? null}
                rx={we.prescription?.[s.setNumber - 1] ?? null}
                suggestion={suggestions[s.id] ?? null}
                unit={blockUnit}
                barWeightKg={barWeightKg}
                onUpdate={(patch) => void write(() => repo.updateSetLog(s.id, patch))}
                onToggleDone={onToggleDone(s)}
                onToggleDoneSingle={onRoundToggle ? onToggleDone(s, true) : undefined}
                loadNote={loadNotes[s.id] ?? rxLoadLabel(we.prescription?.[s.setNumber - 1] ?? null)}
                onSetType={(type) => void write(() => repo.setSetType(s.id, type))}
                onSetArm={(arm) => void write(() => repo.setSetArm(s.id, arm))}
                onSetGrip={(grip) => void write(() => repo.setSetGrip(s.id, grip))}
                onDelete={() => void write(() => repo.deleteSetLog(s.id))}
                onApplySuggestion={() => {
                  const sug = suggestions[s.id];
                  if (!sug) return;
                  void write(() => repo.updateSetLog(s.id, { weightKg: sug.weightKg }));
                  setSuggestions((m) => {
                    const { [s.id]: _drop, ...rest } = m;
                    return rest;
                  });
                }}
              />
            ),
          )}
        </div>

        <div className="mt-[var(--spacing-sm)]">
          <Button
            title={t("session.addSet")}
            icon="add"
            variant="secondary"
            loading={busy}
            onPress={addSet}
            testId="btn-add-set"
          />
        </div>

        {/* 메모 — 그날의 느낌·포인트. 다음에 같은 종목을 할 때 지난 메모로 보인다. */}
        {noteOpen ? (
          <textarea
            data-testid="we-note"
            value={note}
            rows={2}
            placeholder={t("session.notePlaceholder")}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => void write(() => repo.setWorkoutExerciseNote(we.id, note))}
            className="mt-[var(--spacing-sm)] min-h-[38px] w-full rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-surface-alt) p-[var(--spacing-md)] text-[length:var(--text-md)] text-(--color-ink) placeholder:text-(--color-ink3)"
          />
        ) : null}

        {!prevCleared && prevNote && prevNote !== note.trim() ? (
          <AppText variant="caption" color="textFaint" className="mt-[2px] block">
            {t("session.prevNote", { note: prevNote })}
          </AppText>
        ) : null}

        {prevNote ? (
          <NoteHistoryPanel repo={repo} exerciseId={we.exerciseId} variantKey={variantKey} />
        ) : null}

        {/* 휴식 시간 — 이 종목의 **설정값**이다(⋯ → 휴식 시간 시트). 카운트다운 자체는 운동 전체에 하나뿐이다. */}
      </div>

      {slotsOpen ? (
        <SheetShell
          title={t("session.otherSlotsTitle")}
          onClose={() => setSlotsOpen(false)}
          testId="slots-sheet"
        >
          <div className="mt-[var(--spacing-sm)] flex flex-col gap-[var(--spacing-sm)]">
            {slots.length === 0 ? (
              <AppText variant="caption" color="textMuted">
                {t("session.otherSlotsEmpty")}
              </AppText>
            ) : null}
            {slots.map((x) => {
              const current = (x.variantKey ?? null) === (variantKey ?? null);
              return (
                <div
                  key={x.variantKey ?? "default"}
                  data-testid={`slot-${x.variantKey ?? "default"}`}
                  className="rounded-[var(--radius-md)] border border-(--color-line) p-[var(--spacing-md)]"
                >
                  <div className="flex items-center gap-[var(--spacing-sm)]">
                    <AppText variant="body" className="min-w-0 flex-1 font-bold">
                      {variantLabelFromKey(x.variantKey, lang, machineVariantLabels)}
                    </AppText>
                    {current ? (
                      <Tag label={t("session.currentSlot")} tone="primary" />
                    ) : (
                      <Button
                        title={t("session.useThisSlot")}
                        size="sm"
                        variant="secondary"
                        fullWidth={false}
                        testId="btn-use-slot"
                        onPress={() => {
                          const dims = { ...parseVariantKey(x.variantKey), arm: null };
                          setVariant(dims);
                          setSlotsOpen(false);
                          void write(() => repo.setVariant(we.id, dims));
                        }}
                      />
                    )}
                  </div>
                  <AppText variant="caption" color="textMuted" className="block">
                    {t("session.slotSessions", {
                      date: new Date(x.lastAt).toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US", {
                        month: "short",
                        day: "numeric",
                      }),
                      count: x.sessions,
                    })}
                  </AppText>
                  <AppText variant="caption" className="block" data-testid="slot-last-sets">
                    {x.lastSets
                      .map((ls) => `${formatEnteredWeight(ls.weightKg, blockUnit)}×${ls.reps}`)
                      .join(" · ")}
                  </AppText>
                  {x.best ? (
                    <AppText variant="caption" color="pr" className="block">
                      {t("session.slotBest", {
                        weight: formatEnteredWeight(x.best.weightKg, blockUnit),
                        reps: x.best.reps,
                      })}
                    </AppText>
                  ) : null}
                </div>
              );
            })}
          </div>
        </SheetShell>
      ) : null}

      {restSheet ? (
        <SheetShell title={t("session.restTime")} onClose={() => setRestSheet(false)} testId="rest-sheet">
          <div className="mt-[var(--spacing-md)] flex justify-center">
            <NumberStepper
              testId="rest-seconds"
              value={restSeconds}
              step={15}
              min={0}
              max={600}
              suffix={t("session.secondsSuffix")}
              // app과 같이 **이 세션 동안의 설정**이다 — 저장소에 쓰지 않는다.
              onChange={setRestSeconds}
            />
          </div>
        </SheetShell>
      ) : null}

      {confirmRemove ? (
        <ConfirmDialog
          testId="confirm-remove-exercise"
          title={t("session.removeExerciseTitle")}
          message={t("session.removeExerciseMessage")}
          confirmLabel={t("common.delete")}
          destructive
          onCancel={() => setConfirmRemove(false)}
          onConfirm={() => {
            setConfirmRemove(false);
            void write(() => repo.removeWorkoutExercise(we.id));
          }}
        />
      ) : null}
    </Card>
  );
}

function HeadCell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`shrink-0 text-center ${className}`}>
      <AppText variant="label" color="textFaint">
        {children}
      </AppText>
    </span>
  );
}

/** 처방 세트의 무게 기준 한 줄(아직 계산 근거가 없을 때) — 「1RM의 80%」 · 「탑셋의 90%」 · 「처방 무게」 @plm SRS-063 */
function rxLoadLabel(rx: { loadBasis?: string; loadPct?: number } | null): string | null {
  if (!rx?.loadBasis) return null;
  if (rx.loadBasis === "pct1rm") return t("prescription.load.labelPct1rm", { pct: rx.loadPct ?? 0 });
  if (rx.loadBasis === "pctTop") return t("prescription.load.labelPctTop", { pct: rx.loadPct ?? 0 });
  return t("prescription.load.reasonFixed");
}
