"use client";
// 루틴 한눈에(SPEC-045 · SRS-110) — 목록 줄의 종목 한 줄(ExerciseLine)과 줄을 누르면 여는 미리보기 시트.
// 시트: 종목마다 이름 · 「3세트 · 8-12회」(처방이면 웜업·드롭 따로) · 운동 화면과 같은 순서·슈퍼셋 묶음 · 아래 「시작」·「편집」.
import type RoutineExercise from "@app/core/db/models/RoutineExercise";
import { useQueryDataStatus } from "@app/core/db/hooks";
import { repRangeLabel } from "@app/core/domain/prescription";
import {
  routineExerciseSummary,
  routineLineText,
  sessionOrderLabels,
  type RoutineLineSummary,
} from "@app/core/domain/routineSummary";
import { type CreatorTip, dayNumber, type MuscleGroup, preWorkoutTip } from "@app/core";
import { useEffect, useMemo, useState } from "react";
import { useExerciseNames } from "@/lib/exerciseNames";
import { useBackToClose } from "@/lib/useBackToClose";
import { t } from "@/lib/i18n";
import { Button } from "../ui/Button";
import { SheetShell } from "../ui/Dialog";
import { AppText } from "../ui/primitives";
import { ListGroup, ListRow } from "../ui/rows";
import { TipDetail } from "./CreatorTipSheet";

type RoutineRepo = typeof import("@app/core/data/routineRepository");
/** 시트 — 세트 수·횟수·처방·묶음까지 지켜본다 */
const WATCH = [
  "exercise_id",
  "sort_order",
  "target_sets",
  "target_reps_min",
  "target_reps_max",
  "prescription",
  "superset_group",
];
const EMPTY_MUSCLES: MuscleGroup[] = [];
/** 목록 줄 — 이름 한 줄만 그리므로 종목·순서만(루틴 수만큼 도는 구독을 가볍게 · 코드 리뷰 정확성 5) */
const WATCH_LINE = ["exercise_id", "sort_order"];

/**
 * 루틴 종목(정렬) + 표시 이름(+ 시트면 종류).
 * 이름은 모듈 캐시(useExerciseNames)를 거쳐 「내가 부르는 이름」 변경·카탈로그 동기 뒤에 다시 읽고(정확성 2),
 * 지금 종목 구성으로 읽은 값만 쓴다 — 그 전에는 null(옛 지도·빈 지도로 그리지 않는다 · 정확성 1 · UX 6).
 */
function useRoutineLines(repo: RoutineRepo | null, routineId: string, opts: { withKinds?: boolean } = {}) {
  const { data, loaded } = useQueryDataStatus(
    () => (repo ? repo.queryRoutineExercises(routineId) : null),
    [repo, routineId],
    opts.withKinds ? WATCH : WATCH_LINE,
  );
  const rows = data as RoutineExercise[];
  const sorted = useMemo(() => [...rows].sort((a, b) => a.sortOrder - b.sortOrder), [rows]);
  const ids = useMemo(() => sorted.map((r) => r.exerciseId), [sorted]);
  const nameMap = useExerciseNames(ids);
  const key = ids.join(",");
  // [원본] const [kinds, setKinds] = useState<{ key: string; map: Map<string, string> } | null>(null);
  // [개선] 주동근도 같은 단계에서 읽는다 — 「시작 전」 팁 줄이 목록·버튼과 같은 순간에 나타나게(SPEC-047 · 스펙 리뷰 U1)
  const [kinds, setKinds] = useState<{
    key: string;
    map: Map<string, string>;
    muscles: MuscleGroup[];
  } | null>(null);
  const withKinds = opts.withKinds === true;
  useEffect(() => {
    if (!withKinds) return;
    let alive = true;
    const list = key ? key.split(",") : [];
    void (async () => {
      try {
        // [원본] const { getExerciseKinds } = await import("@app/core/data/exerciseRepository");
        // const k = await getExerciseKinds(list);
        // if (alive) setKinds({ key, map: k as Map<string, string> });
        const { getExerciseKinds, getExercisePrimaryMuscles } = await import(
          "@app/core/data/exerciseRepository"
        );
        const [k, pm] = await Promise.all([getExerciseKinds(list), getExercisePrimaryMuscles(list)]);
        const muscles = [...new Set([...pm.values()].flat())];
        if (alive) setKinds({ key, map: k as Map<string, string>, muscles });
      } catch {
        if (alive) setKinds({ key, map: new Map(), muscles: [] });
      }
    })();
    return () => {
      alive = false;
    };
  }, [key, withKinds]);
  const kindMap = kinds && kinds.key === key ? kinds.map : null;
  // 행을 다 받고 이름(시트면 종류도)까지 읽은 뒤에야 그린다 — 「종목 없음」 깜빡임 방지(스펙 리뷰 M1)
  const ready = loaded && nameMap != null && (!withKinds || kindMap != null);
  /** 이름 — 이 기기에 없는 종목은 「이 기기에 없는 종목」(빈 제목·개수 어긋남 방지 · 정확성 7 · UX 5) */
  const nameOf = (id: string) => nameMap?.get(id) ?? t("creator.missingExercise");
  const muscles = kinds && kinds.key === key ? kinds.muscles : EMPTY_MUSCLES;
  return { sorted, ready, nameOf, kinds: kindMap ?? new Map<string, string>(), muscles };
}

// 목록 안 표식은 「routine-」로 시작하지 않는다 — e2e 여러 곳이 [data-testid^=routine-] 를 루틴 줄로 센다
/** 목록 줄의 종목 한 줄 — 앞 세 개 + 「외 N」(이름이 잘려도 「외 N」은 보인다) */
export function ExerciseLine({ repo, routineId }: { repo: RoutineRepo | null; routineId: string }) {
  const { sorted, ready, nameOf } = useRoutineLines(repo, routineId);
  // 이름을 다 받기 전에는 한 줄 높이 자리만 — 공백 하나면 높이 0 이라 받는 순간 목록이 밀렸다(UX 3)
  if (!ready)
    return (
      <AppText variant="caption" color="textMuted" className="mt-[2px] block" data-testid="exercise-line">
        {"\u00A0"}
      </AppText>
    );
  if (!sorted.length)
    return (
      <AppText variant="caption" color="textMuted" className="mt-[2px] block" data-testid="exercise-line">
        {t("routines.noExercises")}
      </AppText>
    );
  const { shown, more } = routineLineText(sorted.map((r) => nameOf(r.exerciseId)));
  return (
    <span
      className="mt-[2px] flex min-w-0 items-baseline"
      data-testid="exercise-line"
      data-count={sorted.length}
    >
      <AppText variant="caption" color="textMuted" className="block min-w-0 truncate">
        {shown.join(" · ")}
      </AppText>
      {more > 0 ? (
        <AppText
          variant="caption"
          color="textMuted"
          className="ml-[4px] block shrink-0"
          data-testid="exercise-line-more"
        >
          {t("routines.moreCount", { count: more })}
        </AppText>
      ) : null}
    </span>
  );
}

function summaryText(s: RoutineLineSummary): string {
  if (s.cardio) return t("routines.previewCardio");
  // 횟수 표기는 다른 화면과 같은 repRangeLabel(「8-12」 · 「~5」 · 「8+」 · 스펙 리뷰 H2)
  const range = repRangeLabel(s.repMin, s.repMax);
  const parts: string[] = [];
  // 작업 세트가 없으면(웜업만) 「0세트」를 쓰지 않는다(정확성 6)
  if (s.sets > 0) parts.push(t("routines.previewSets", { count: s.sets }));
  if (range) parts.push(t("routines.previewReps", { reps: range }));
  // 「최대」 세트가 섞이면 범위 뒤에 덧붙인다 — 마지막 세트도 8-12처럼 읽히지 않게(정확성 6)
  if (s.amrap) parts.push(t("routines.previewAmrap"));
  if (s.warmups > 0) parts.push(t("routines.previewWarmups", { count: s.warmups }));
  if (s.drops > 0) parts.push(t("routines.previewDrops", { count: s.drops }));
  return parts.join(" · ");
}

export function RoutinePreviewSheet({
  repo,
  routineId,
  name,
  busy,
  onClose,
  onStart,
  onEdit,
}: {
  repo: RoutineRepo | null;
  routineId: string;
  name: string;
  /** 목록 「시작」과 같은 잠금(첫 화면 판단 전·시작 중) */
  busy: boolean;
  onClose: () => void;
  onStart: () => void;
  onEdit: () => void;
}) {
  const { sorted, ready, nameOf, kinds, muscles } = useRoutineLines(repo, routineId, { withKinds: true });
  // 「시작 전」 팁(SPEC-047) — ready 와 같은 순간에 정해진다(부위를 같은 단계에서 읽는다). 같은 날·같은 루틴이면 같은 팁
  // 날짜는 시트를 연(목록이 준비된) 시점의 값으로 고정한다 — 시트를 연 채 자정을 넘겨도 바꾸지 않는다(의도)
  const tipKey = sorted.map((r) => r.exerciseId).join(",");
  const tip = useMemo(
    () => (ready ? preWorkoutTip(tipKey ? tipKey.split(",") : [], muscles, dayNumber(Date.now())) : null),
    [ready, tipKey, muscles],
  );
  const [tipOpen, setTipOpen] = useState<CreatorTip | null>(null);
  // 기기 뒤로 = 팁 상세만 닫기(칸 하나 더) — 다시 뒤로면 미리보기 닫기(코드 리뷰 REV-089 H-1)
  useBackToClose(() => setTipOpen(null), tipOpen !== null);
  // [원본] 연달아 있는 같은 그룹만 A1·A2(스펙 리뷰 M4) — 운동 화면 순서와 어긋났다
  // const ss = useMemo(() => supersetLabels(sorted.map((r) => r.supersetGroup ?? null)), [sorted]);
  // [개선] 운동 화면과 같은 순서·묶음(groupSessionRows · 코드 리뷰 정확성 4)
  const order = useMemo(() => sessionOrderLabels(sorted.map((r) => r.supersetGroup ?? null)), [sorted]);
  if (tipOpen) {
    // 시트를 겹치지 않고 같은 미리보기 안에서 팁 상세로 — 「‹ 루틴」·기기 뒤로가 미리보기로 돌아온다(스펙 리뷰 U3)
    return (
      <SheetShell
        title=""
        ariaLabel={tipOpen.titleKo}
        onClose={() => setTipOpen(null)}
        hideOk
        testId="routine-preview"
      >
        <TipDetail
          tip={tipOpen}
          backLabel={t("tips.backToRoutine", { name })}
          onBack={() => setTipOpen(null)}
        />
      </SheetShell>
    );
  }
  return (
    <SheetShell title={name} onClose={onClose} hideOk testId="routine-preview">
      {!ready ? (
        // 받는 동안 줄 세 개쯤 자리 — 목록이 들어올 때 시트가 덜 튄다(UX 4)
        <div className="mb-[var(--spacing-lg)] min-h-[168px]" />
      ) : sorted.length === 0 ? (
        <AppText variant="body" color="textMuted" className="mb-[var(--spacing-lg)] block">
          {t("routines.noExercises")}
        </AppText>
      ) : (
        <ListGroup className="mb-[var(--spacing-lg)]" testId="routine-preview-list">
          {order.map(({ index, label: g }, i) => {
            const r = sorted[index];
            const s = routineExerciseSummary({
              targetSets: r.targetSets,
              targetRepsMin: r.targetRepsMin,
              targetRepsMax: r.targetRepsMax,
              prescription: r.prescription,
              cardio: kinds.get(r.exerciseId) === "cardio",
            });
            return (
              <ListRow
                key={r.id}
                testId="routine-preview-row"
                leading={
                  <span className="w-5 shrink-0 text-center text-(--color-ink3) text-[length:var(--text-sm)] tabular-nums">
                    {String(i + 1)}
                  </span>
                }
                title={nameOf(r.exerciseId)}
                subtitle={summaryText(s)}
                value={g ? t("routines.previewSuperset", { group: g }) : undefined}
              />
            );
          })}
        </ListGroup>
      )}
      {ready && tip ? (
        <button
          type="button"
          data-testid="routine-preview-tip"
          onClick={() => setTipOpen(tip)}
          className="mb-[var(--spacing-md)] flex min-h-[44px] w-full min-w-0 items-center gap-[var(--spacing-sm)] rounded-[var(--radius-md)] bg-(--color-surface-alt) px-[var(--spacing-md)] text-left"
        >
          <span className="shrink-0 text-(--color-ink3) text-[length:var(--text-xs)]">
            {t("tips.preWorkout")}
          </span>
          <span className="min-w-0 flex-1 truncate text-(--color-ink) text-[length:var(--text-sm)]">
            {tip.titleKo}
          </span>
          <span aria-hidden className="shrink-0 text-(--color-ink3)">
            ›
          </span>
        </button>
      ) : null}
      <div className="flex gap-[var(--spacing-sm)]">
        <div className="flex-1">
          <Button
            title={t("routines.edit")}
            variant="secondary"
            testId="routine-preview-edit"
            onPress={onEdit}
          />
        </div>
        <div className="flex-1">
          <Button
            title={t("routines.start")}
            icon="play"
            testId="routine-preview-start"
            disabled={busy || sorted.length === 0}
            onPress={onStart}
          />
        </div>
      </div>
    </SheetShell>
  );
}
