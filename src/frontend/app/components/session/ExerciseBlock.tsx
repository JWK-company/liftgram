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
  // blockLoadMultiplier, // [원본] V1 배수 — 플레이트 칸 + 「한쪽」 켬일 때만 2(피드백 #63 전)
  canonicalVariantKey,
  parseVariantKey,
  variantLabelFromKey,
  type SlotSummary,
  effectiveWeightKg,
  formatEnteredWeight,
  roundSuggestionKg,
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
// [원본] import { carryWeightAcrossMultiplier } from "@app/core/domain/recordSlots";
import { carryWeightAcrossMultiplierV2 } from "@app/core/domain/recordSlots"; // 옛 null 기록은 숫자 그대로 @plm SRS-084
import { usePlateOneSide } from "@/lib/usePlateOneSide";
import { BlockTools } from "./BlockTools";
import { PlateAskLine } from "./PlateAskLine";
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
// import { IconButton } from "../ui/IconButton"; // 머리 순서 화살표 원복 시(/qa code M-5)
import { NumberStepper } from "../ui/inputs";
import { AppText, Card, Tag } from "../ui/primitives";
// [원본] import { VariantSelector } from "../ui/VariantSelector";
import { RecordSlotSelector } from "../ui/RecordSlotSelector";
import { UnitToggle } from "../ui/UnitToggle";
import { FoldToggle, MetaAction, MetaLine, PrText, useFold } from "../ui/quiet";
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
  /** 이 블록이 속한 운동 — 「더 보기」 펼침을 이번 운동 동안만 기억하는 데 쓴다(/qa code M-1) */
  workoutId?: string;
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
  // [원본] const [noteOpen, setNoteOpen] = useState(() => !!we.note?.trim());
  // [개선] 메모는 블록 도구 줄의 첫 줄 미리보기로 보이고, 누르면 입력칸이 열린다(피드백 #62) — noteOpen = 쓰는 중 @plm SRS-084
  const [noteOpen, setNoteOpen] = useState(false);
  const [restSheet, setRestSheet] = useState(false);
  const [volTick, setVolTick] = useState(0);
  // ── 기록 칸(조합) — 플레이트 한쪽 입력 · 다른 조합 기록(ADR-034 · ADR-037) @plm SRS-058 ──
  const { machineVariantLabels } = useUser();
  // [원본] const [plateOneSide, setPlateOneSideState] = useState(false);
  // [개선] 입력 방식 선택(tri-state)·플레이트 후보 — 후보 머신은 기본이 한쪽(피드백 #63) @plm SRS-084
  const plate = usePlateOneSide(we.exerciseId);
  const [slots, setSlots] = useState<SlotSummary[]>([]);
  const [slotsOpen, setSlotsOpen] = useState(false);
  // 「더 보기」 펼침 — 블록 전체가 하나(종목마다 따로 두지 않는다 · /qa spec Q6) @plm SRS-069
  // [원본] const [foldOpen, setFoldOpen] = useFold("block"); — 한 번 펴면 다음 운동까지 영원히 펴졌다(/qa code M-1)
  // [개선] 이번 운동 동안만 기억 — 새 운동은 접힌 채로 시작한다
  const [foldOpen, setFoldOpen] = useFold(`block:${we.workoutId ?? "-"}`);

  // ── 블록 무게 단위(kg|lb) — 한 헬스장에 kg·lb 기구가 섞여 있다(2026-10-27) @plm SRS-067 ──
  // 기본값 = 같은 종목·칸으로 마지막에 완료한 블록의 단위(저장소가 정한다 · 환산 없음). 토글은 숫자 유지·단위만(Q4 B).
  // 블록 안의 무게(머리·입력·이전 기록·PR·제안)는 이 단위, **볼륨은 kg**(Q2 A).
  // `unit` prop 은 이제 「정하기 전 잠깐」의 자리값일 뿐이다.
  const [blockUnit, setBlockUnit] = useState<WeightUnit>(() =>
    we.weightUnit === "lb" ? "lb" : we.weightUnit === "kg" ? "kg" : unit,
  );
  // 단위가 정해지기 전(종목 추가·교체 직후)·토글이 쓰는 동안은 토글을 막는다 — 정하기와 토글이 겹치면 숫자 의미가
  // 달라졌다(/qa code M-4·H-1). 저장소가 writer 안에서 판단하고, 화면은 돌려받은 단위를 따른다. @plm SRS-067
  const [unitReady, setUnitReady] = useState(() => we.weightUnit === "lb" || we.weightUnit === "kg");
  const [unitBusy, setUnitBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void repo
      .ensureBlockUnit(we.id)
      .then((u) => {
        if (alive) {
          setBlockUnit(u);
          setUnitReady(true);
        }
      })
      .catch(() => {
        if (alive) setUnitReady(true);
      });
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
  // [원본] 낙관적으로 단위를 바꾸고 호출을 기다리지 않았다 — 연타하면 DB lb·화면 kg 로 어긋나 100 이 45.36 으로 보였다(/qa code H-1)
  // const switchUnit = (to: WeightUnit) => {
  //   if (to === blockUnit) return;
  //   setBlockUnit(to);
  //   void write(() => repo.switchBlockWeightUnit(we.id, to)).then(…).catch(() => setBlockUnit(blockUnit));
  // };
  // [개선] 한 번에 하나 — 끝날 때까지 토글을 막고, 저장소가 돌려준 단위를 따른다(화면이 본 단위를 넘겨 낡은 판단은 무시된다)
  const switchUnit = (to: WeightUnit) => {
    if (to === blockUnit || unitBusy || !unitReady) return;
    const from = blockUnit;
    setUnitBusy(true);
    void (async () => {
      try {
        const got = await repo.switchBlockWeightUnit(we.id, to, from);
        setBlockUnit(got);
        await onChanged();
        if (got === to) toast(t("session.unitSwitched", { unit: to }));
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), "error");
      } finally {
        setUnitBusy(false);
      }
    })();
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

  // [원본] 한쪽 입력 선호(사용자 × 종목) — 종목이 바뀌면 다시 읽는다 → usePlateOneSide 가 맡는다(피드백 #63)
  // useEffect(() => {
  //   let alive = true;
  //   void import("@app/core/data/exercisePrefs").then(async (m) => {
  //     const on = await m.getPlateOneSide(we.exerciseId);
  //     if (alive) setPlateOneSideState(on);
  //   });
  //   return () => {
  //     alive = false;
  //   };
  // }, [we.exerciseId]);

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

  // [원본] const oneSide = blockLoadMultiplier(variant, plateOneSide) === 2;
  const blockMultiplier = plate.multiplier(variant); // @plm SRS-084
  const oneSide = blockMultiplier === 2;
  const plateOneSide = plate.choice !== false && blockMultiplier === 2; // 칸 시트 토글의 체크(실효값)
  const askPlate = !isCardio && plate.needsAsk(variant);
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

  // [원본] 쓰기마다 따로 돌았다 — 횟수 칸 blur 직후 PR 을 누르면 blur 저장이 PR 채우기보다 늦게 끝나 PR 값을 덮었다
  //        (화면 정리 P1 e2e 가 잡음 · 폰에서 입력 뒤 바로 PR 을 누를 때와 같다).
  // const write = useCallback(async (fn: () => Promise<unknown>) => { await fn(); await onChanged(); }, [onChanged]);
  // [개선] 블록 안의 쓰기는 부른 순서대로 하나씩 — 앞 쓰기가 실패해도 다음 쓰기는 돈다 @plm SRS-061
  const writeChain = useRef<Promise<unknown>>(Promise.resolve());
  const write = useCallback(
    (fn: () => Promise<unknown>) => {
      const run = writeChain.current
        .catch(() => {})
        .then(async () => {
          await fn();
          await onChanged();
        });
      writeChain.current = run;
      return run;
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
    // [원본] const weightKg = carryWeightAcrossMultiplier(ref.inputWeightKg, ref.loadMultiplier, blockLoadMultiplier(variant, plateOneSide));
    const weightKg = carryWeightAcrossMultiplierV2(ref.inputWeightKg, ref.loadMultiplier, blockMultiplier); // @plm SRS-084
    void write(() => repo.updateSetLog(target.id, { weightKg, reps: ref.reps })).then(() =>
      toast(t("session.prFilled", { weight: formatEnteredWeight(weightKg, blockUnit), reps: ref.reps })),
    );
  }

  // [원본] 「이전기록 지우기」는 팁 줄 오른쪽(또는 메타 칩 줄 끝)에 늘 보였다 — 화면 정리 뒤엔 「더 보기」 안 @plm SRS-069
  const prevClearBtn =
    !isCardio && (hasPrev || prevCleared) ? (
      <MetaAction testId="prev-clear" onPress={() => setPrevCleared((v) => !v)}>
        {prevCleared ? t("session.showPrev") : t("session.clearPrev")}
      </MetaAction>
    ) : null;
  const otherSlotsBtn =
    !isCardio && otherSlots.length > 0 ? (
      <MetaAction testId="btn-other-slots" onPress={() => setSlotsOpen(true)}>
        {t("session.otherSlots")} ({otherSlots.length})
      </MetaAction>
    ) : null;
  // 이번 칸에 기록이 하나도 없으면 「다른 조합 기록 보기」는 접지 않고 메타 줄에 꺼내 둔다 —
  // 빈 칸에서 지난 조합의 무게를 찾는 단서라서(/qa code M-4). 기록이 있는 평소에는 「더 보기」 안.
  const otherSlotsOut = !!otherSlotsBtn && prevSets.length === 0 && !prs.weight && !prs.volume;
  // 「더 보기」에 넣을 것이 있을 때만 토글을 둔다(운동 방법 · 다른 조합 · 이전기록 지우기)
  // [원본] const hasFold = !isCardio && (hasTip || !!otherSlotsBtn || !!prevClearBtn);
  const hasFold = !isCardio && (hasTip || (!!otherSlotsBtn && !otherSlotsOut) || !!prevClearBtn);
  const showPr = !isCardio && !prevCleared && (prs.weight || prs.volume);
  // 중량 PR 과 볼륨 PR 이 다른 세트면 두 조각 — 메타 줄 가운데서 꺾이지 않게 자기 줄로 내린다(/qa code M-7)
  const prOwnLine = !!showPr && !!prs.weight && !!prs.volume && prs.weight.setLogId !== prs.volume.setLogId;
  const volumeText =
    !isCardio && (exVol.volume > 0 || exVol.reps > 0)
      ? exVol.volume > 0
        ? t("session.exVolume", { volume: formatWeight(exVol.volume, "kg") }) // 볼륨은 kg(Q2 A) @plm SRS-067
        : t("session.exTotalReps", { reps: exVol.reps })
      : isCardio && cardioTotal
        ? t("session.cardioTotal", { total: cardioTotal })
        : null;

  // ─────────────────────────────────────────────────────────────────────────────
  // 화면 정리 P1(D2·D3·D4 · SRS-069) — 정보는 그대로, 상자·빨강을 걷어 낸다.
  //   머리      [▲▼] [그림] 이름 ············ 회색 볼륨 · ⋯
  //   메타 줄    조합 ▾ · 슈퍼세트 · 금색 PR(누르면 채움 · ⓘ 기록) · 경고            더 보기 ▾
  //   더 보기    운동 방법 · 다른 조합 · 이전기록 지우기 (펼침은 기기에 기억 — 전역 하나)
  //   표 머리    세트 · 이전 · 무게 kg│lb · 횟수
  // [원본] 메타 칩 줄(테두리 알약 변형·PR 칩·kg/lb 알약·볼륨 태그) + 「이전 기록 · 조합」 줄 + 팁 줄 — 커밋 5222c61 의 이 파일
  //   (피드백 #62 · SRS-084) 세트 추가 아래 도구 한 줄 — ⏱ 휴식 · ✎ 메모 · ⌃⌄ 순서(메뉴에서 꺼냄 · 회색 · 44px)
  //   (피드백 #63 · SRS-084) 세트 표 아래 「원판 한쪽 무게로 적나요?」 — 플레이트 후보 머신에서 입력 방식을 안 정했을 때 한 번
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <Card
      className={
        insideSuperset ? "border-0! bg-transparent! p-0! py-[var(--spacing-sm)]!" : "mb-[var(--spacing-lg)]"
      }
    >
      <div data-testid={`we-${we.id}`}>
        {/* 헤더 — 화살표는 그림 왼쪽 자기 열(F3: 겹치지 않게) */}
        <div className="flex items-center gap-[var(--spacing-sm)]">
          {/* [원본] 그림 왼쪽 순서 화살표 열 — 22×28px 두 개가 붙어 있어 잘못 누르기 쉬웠다(/qa code M-5, 순서 변경은 되돌리기가 없다).
              [개선] ⋯ 메뉴의 「위로 이동 · 아래로 이동」(줄 높이 44px+). 블록 머리 소음도 한 열 준다. 원복 시 아래를 되살린다.
              {onMoveUp || onMoveDown ? (
              <div className="flex w-[28px] shrink-0 flex-col items-center">
              <IconButton
              icon="chevron-up"
              size={18}
              label={t("session.moveUp")}
              disabled={!onMoveUp}
              color={onMoveUp ? "var(--color-ink2)" : "var(--color-line)"}
              onPress={onMoveUp}
              className="h-[22px]! w-[28px]!"
              />
              <IconButton
              icon="chevron-down"
              size={18}
              label={t("session.moveDown")}
              disabled={!onMoveDown}
              color={onMoveDown ? "var(--color-ink2)" : "var(--color-line)"}
              onPress={onMoveDown}
              className="h-[22px]! w-[28px]!"
              />
              </div>
              ) : null}
          */}
          {/* P5: 종목 그림(정지) — 이름만으로 헷갈리는 종목을 한눈에(피드백 #8) @plm SRS-055 */}
          {hasPictogram(we.exerciseId) ? (
            <span className="h-9 w-11 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-(--color-surface-alt)">
              <Pictogram exerciseId={we.exerciseId} className="h-full w-full" testId="we-picto" />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <ExerciseName exerciseId={we.exerciseId} variant="heading" base revealOnTap testId="we-name" />
          </div>

          {/* 이 종목 볼륨 — 오른쪽 회색 숫자(정보일 뿐 행동이 아니다 · 빨강 태그였던 것) */}
          {volumeText ? (
            <span
              data-testid="ex-volume"
              className="shrink-0 text-[length:var(--text-xs)] text-(--color-ink3) tabular-nums"
            >
              {volumeText}
            </span>
          ) : null}

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
              // [원본] 순서 바꾸기 — 머리 화살표 대신(/qa code M-5 · H-3) @plm SRS-069
              // [개선] 블록 아래 도구 줄의 ⌃ ⌄(누르는 자리 44px)로 꺼냈다(피드백 #62) — 원복 시 아래를 되살리고 BlockTools 의 순서 버튼을 뺀다 @plm SRS-084
              // ...(onMoveUp
              //   ? [{ label: t("session.moveUp"), testId: "btn-move-up", onPress: () => onMoveUp() }]
              //   : []),
              // ...(onMoveDown
              //   ? [{ label: t("session.moveDown"), testId: "btn-move-down", onPress: () => onMoveDown() }]
              //   : []),
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
              // [원본] 휴식 시간·메모 열기도 메뉴 안이었다 → 블록 도구 줄로(피드백 #62) @plm SRS-084
              // {
              //   label: `${t("session.restTime")} · ${restSeconds}${t("session.secondsSuffix")}`,
              //   testId: "btn-rest-setting",
              //   onPress: () => setRestSheet(true),
              // },
              // ...(noteOpen
              //   ? []
              //   : [{ label: t("session.notePlaceholder"), testId: "btn-note-open", onPress: () => setNoteOpen(true) }]),
              {
                label: t("session.removeExerciseTitle"),
                destructive: true,
                testId: "btn-remove-exercise",
                onPress: () => setConfirmRemove(true),
              },
            ]}
          />
        </div>

        {/* 메타 줄 — 조합 · 슈퍼셋 · PR · 경고 (회색, PR 만 금색) + 오른쪽 「더 보기」 */}
        <div className="mt-[2px] flex items-start gap-[var(--spacing-sm)]">
          <MetaLine className="flex-1" testId="we-meta">
            {!isCardio ? (
              // [원본] 기구 칩이 같은 종목의 변형 칸이던 선택기 — P2 에서 기구 바꾸기 = 종목 바꾸기(ADR-033·034)
              // <VariantSelector baseEquipment={baseEquipment} value={variant} onChange={...} />
              <RecordSlotSelector
                key="slot"
                exerciseId={we.exerciseId}
                baseEquipment={baseEquipment}
                value={variant}
                onChange={(dims) => {
                  setVariant(dims);
                  // 아직 안 정한 종목에서 핀을 고르면 「양쪽 합·핀」으로 답한 것이다(저장소가 기록 · /qa code M-1) @plm SRS-084
                  if (plate.candidate && plate.choice == null && dims.load === "pin")
                    plate.setChoiceLocal(false);
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
                plateDefaultLoad={plate.defaultLoad}
                onPlateOneSide={(on) => {
                  // [원본] setPlateOneSideState(on);
                  // void write(() => repo.setPlateOneSideForExercise(we.exerciseId, on));
                  // [개선] 끄기(양쪽 합)도 선택으로 기억 — 다시 묻지 않는다(피드백 #63) @plm SRS-084
                  plate.setChoiceLocal(on);
                  void write(() => repo.setPlateOneSideForExerciseV2(we.exerciseId, on));
                }}
              />
            ) : null}
            {we.supersetGroup && !insideSuperset ? (
              <span key="ss" className="inline-flex min-h-[32px] items-center">
                {t("session.superset")}
              </span>
            ) : null}
            {/* 중량 PR·볼륨 PR — 금색 글자 조각. 누르면 아직 안 한 첫 세트에 채우고 ⓘ 는 그 기록으로(#50·#51 · D3) @plm SRS-061 SRS-069
                PR 이 한 조각이면 이 줄에, 두 조각이면 아래 자기 줄에(좁은 폭에서 줄 가운데가 꺾여 「·」 만 남던 것 · /qa code M-7) */}
            {showPr && !prOwnLine
              ? prChips().map((c) => (
                  <PrText
                    key={`pr-${c.kind}`}
                    label={c.label}
                    // 중량·볼륨이 같은 세트면 그렇다고 읽어 준다 — 화면 글자는 「PR …」 하나(/qa code L-2)
                    ariaLabel={`${c.kind === "both" ? t("session.prBothAria", { label: c.label }) : c.label} — ${t("session.prChipFill")}`}
                    testId={`pr-chip-${c.kind}`}
                    onPress={() => fillFromPr(c.ref)}
                    historyLabel={t("session.prChipHistory")}
                    historyTestId={`pr-chip-${c.kind}-history`}
                    onHistory={() => navigate(`/history/${c.ref.workoutId}?set=${c.ref.setLogId}`)}
                  />
                ))
              : null}
            {otherSlotsOut ? <span key="other">{otherSlotsBtn}</span> : null}
            {bwMissing ? (
              <span
                key="bw"
                className="inline-flex min-h-[32px] items-center font-semibold text-(--color-warn)"
              >
                {t("session.bodyweightNeeded")}
              </span>
            ) : null}
          </MetaLine>
          {hasFold ? (
            <span className="shrink-0">
              <FoldToggle
                testId="block-more"
                open={foldOpen}
                onToggle={() => setFoldOpen(!foldOpen)}
                label={t("session.blockMore")}
                controls={`block-more-${we.id}`}
              />
            </span>
          ) : null}
        </div>

        {/* PR 두 조각(중량 ≠ 볼륨) — 금색 한 줄 */}
        {showPr && prOwnLine ? (
          <MetaLine testId="we-pr-line">
            {prChips().map((c) => (
              <PrText
                key={`pr-${c.kind}`}
                label={c.label}
                // 중량·볼륨이 같은 세트면 그렇다고 읽어 준다 — 화면 글자는 「PR …」 하나(/qa code L-2)
                ariaLabel={`${c.kind === "both" ? t("session.prBothAria", { label: c.label }) : c.label} — ${t("session.prChipFill")}`}
                testId={`pr-chip-${c.kind}`}
                onPress={() => fillFromPr(c.ref)}
                historyLabel={t("session.prChipHistory")}
                historyTestId={`pr-chip-${c.kind}-history`}
                onHistory={() => navigate(`/history/${c.ref.workoutId}?set=${c.ref.setLogId}`)}
              />
            ))}
          </MetaLine>
        ) : null}

        {/* [원본] 「이전 기록 · 조합」을 읽어 주는 글로만 남겨 두었다(sr-only prev-slot) — 이전 기록은 늘 지금 칸에서 읽으므로
            조합 트리거(「변형 선택 — 일자바」)와 같은 말을 한 번 더 읽을 뿐이라 지운다(/qa code L-4).
            원복 시 커밋 432f53f 의 이 자리 span 을 되살린다. @plm SRS-058 SRS-069 */}
        {/* 더 보기 — 운동 방법 · 다른 조합 · 이전기록 지우기 */}
        {hasFold && foldOpen ? (
          <div id={`block-more-${we.id}`} data-testid="block-more-panel" className="mb-[2px]">
            {hasTip ? (
              <ExerciseTipPanel
                exerciseId={we.exerciseId}
                trailing={
                  (otherSlotsBtn && !otherSlotsOut) || prevClearBtn ? (
                    <MetaLine>
                      {otherSlotsOut ? null : otherSlotsBtn}
                      {prevClearBtn}
                    </MetaLine>
                  ) : undefined
                }
              />
            ) : (
              <MetaLine>
                {otherSlotsOut ? null : otherSlotsBtn}
                {prevClearBtn}
              </MetaLine>
            )}
          </div>
        ) : null}

        {/* 표 머리 — 「무게」 칸 안에 kg│lb(D2 · /qa spec Q8). 한쪽 입력이면 칸 위에 「한쪽」 */}
        {/* [원본] mt-[var(--spacing-sm)] — 메타 줄(32px 누르는 자리)이 이미 여백을 갖고 있어 반만 둔다 */}
        <div className="mt-[var(--spacing-xs)] flex items-end gap-[4px] pb-[2px]">
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
              {/* [원본] 「무게 (kg)」·「한쪽(kg)」 글자 칸 — 단위 토글은 PR 칩 옆 알약이었다 */}
              {loadMode === "external" ? (
                <span
                  data-testid="head-weight"
                  data-unit={blockUnit}
                  data-one-side={oneSide ? "1" : "0"}
                  className="flex min-w-0 flex-1 flex-col items-center"
                >
                  {/* 읽어 주는 글 — 「무게 (kg)」·「한쪽(kg)」(보이는 글은 짧게) */}
                  <span className="sr-only">
                    {oneSide
                      ? t("session.weightOneSideLabel", { weightUnit: blockUnit })
                      : t("session.weightLabel", { weightUnit: blockUnit })}
                  </span>
                  {oneSide ? (
                    <span
                      aria-hidden
                      className="font-semibold text-[length:var(--text-xs)] text-(--color-ink2) leading-none"
                    >
                      {t("session.oneSideShort")}
                    </span>
                  ) : null}
                  {/* 칸 이름 자리에 단위 토글 그대로 — 「무게」 글자를 따로 두면 좁은 칸에서 꺾인다(라벨 없는 kg│lb · Q8) */}
                  <span className="inline-flex items-center whitespace-nowrap">
                    <UnitToggle
                      compact
                      value={blockUnit}
                      onChange={switchUnit}
                      disabled={unitBusy || !unitReady}
                    />
                  </span>
                </span>
              ) : (
                <HeadCell className="flex-1">
                  {loadMode === "assisted" ? t("session.assistColHeader") : t("session.addedColHeader")}
                </HeadCell>
              )}
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
                // [원본] onUpdate={(patch) => void write(() => repo.updateSetLog(s.id, patch))}
                // [개선] 저장 약속을 돌려준다 — RIR 칩 낙관 표시가 이 쓰기가 끝난 뒤에만 다른 저장을 따른다(QA CU-7)
                onUpdate={(patch) => write(() => repo.updateSetLog(s.id, patch))}
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
                  // [원본] void write(() => repo.updateSetLog(s.id, { weightKg: sug.weightKg }));
                  // [개선] 블록 단위의 보통 증분으로(lb 블록에 89.95 가 들어가던 것 · /qa code M-2) @plm SRS-067
                  void write(() =>
                    repo.updateSetLog(s.id, { weightKg: roundSuggestionKg(sug.weightKg, blockUnit) }),
                  );
                  setSuggestions((m) => {
                    const { [s.id]: _drop, ...rest } = m;
                    return rest;
                  });
                }}
              />
            ),
          )}
        </div>

        {/* 「원판 한쪽 무게로 적나요?」 — 플레이트 후보 머신에서 입력 방식을 아직 안 정했을 때 한 번(피드백 #63) @plm SRS-084 */}
        {askPlate ? (
          <PlateAskLine
            onAnswer={(on) => {
              plate.setChoiceLocal(on);
              void write(() => repo.answerPlateOneSide(we.exerciseId, on));
            }}
          />
        ) : null}

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

        {/* 블록 도구 한 줄 — 휴식 · 메모 · 순서(⋯ 메뉴에서 꺼냄 · 피드백 #62) @plm SRS-084 */}
        <BlockTools
          restSeconds={restSeconds}
          onRest={() => setRestSheet(true)}
          note={note}
          onNote={() => setNoteOpen(true)}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />

        {/* 메모 — 그날의 느낌·포인트. 다음에 같은 종목을 할 때 지난 메모로 보인다. */}
        {noteOpen ? (
          <textarea
            data-testid="we-note"
            value={note}
            rows={2}
            // biome-ignore lint/a11y/noAutofocus: 사람이 「메모」를 눌러 연 입력칸이다 — 곧바로 쓰게
            autoFocus
            placeholder={t("session.notePlaceholder")}
            onChange={(e) => setNote(e.target.value)}
            // [원본] onBlur={() => void write(() => repo.setWorkoutExerciseNote(we.id, note))}
            // [개선] 저장하고 접는다 — 도구 줄이 첫 줄을 미리 보인다(피드백 #62) @plm SRS-084
            onBlur={() => {
              setNoteOpen(false);
              void write(() => repo.setWorkoutExerciseNote(we.id, note));
            }}
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
                      // [원본] 지금 블록의 단위로 보였다 — 해머(lb) 칸의 100lb 가 kg 블록에서 45.36kg(/qa code M-2) @plm SRS-067
                      .map(
                        (ls) =>
                          `${formatEnteredWeight(ls.weightKg, x.weightUnit === "lb" ? "lb" : "kg")}×${ls.reps}`,
                      )
                      .join(" · ")}
                  </AppText>
                  {x.best ? (
                    <AppText variant="caption" color="pr" className="block">
                      {t("session.slotBest", {
                        weight: formatEnteredWeight(x.best.weightKg, x.weightUnit === "lb" ? "lb" : "kg"),
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
