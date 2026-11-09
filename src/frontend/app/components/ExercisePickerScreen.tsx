"use client";
// @plm SRS-093  전체 화면 종목 고르기 — 루틴 편집에서 종목을 넓게 보고, 부위·기구로 좁혀, 여러 개를 한 번에 넣는다
//
// 루틴 편집 아래에 끼우던 작은 카드(ExercisePicker)는 목록이 몇 줄밖에 안 보이고 부위로 좁힐 수 없었으며,
// 하나 고를 때마다 닫혀 다시 열어야 했다(사용자 피드백 2026-10-30). 그래서 종목 탭(CatalogClient)과 같은
// 뼈대 — 검색 → 도우미 → 근육군·기구 칩 → 줄 목록 — 를 화면 전체에 띄운다.
//
//   multi  : 줄을 누르면 선택이 켜지고 꺼진다(고른 순서 번호) · 아래 「N개 추가」가 고른 순서대로 돌려준다
//   single : 줄을 누르면 바로 돌려준다(종목 교체 — 하나만 고른다)
//
// 검색으로 고른 종목은 그때의 검색 정보(맞은 별칭)를 함께 넘긴다 — 표시 이름은 부르는 쪽이 정한다(SRS-056).
// 검색어·필터를 바꿔도 고른 것은 남는다(가슴에서 둘, 등에서 둘처럼 고르게).
//
// 포털로 #modal-root 에 띄운다 — 루틴 편집의 sticky 하단 줄·셸 탭바 위로 덮어야 하고, 도우미 시트(z-50)는
// 이 위로 떠야 해서 피드 작성기와 같은 z-[45] 다.
import { useQueryData } from "@app/core/db/hooks";
import { hasPictogram } from "@app/core/data/exerciseVisual";
import { exerciseAltName, exerciseListName } from "@app/core/domain/exerciseName";
import {
  buildExerciseSearchIndex,
  compareKoFirst,
  matchedLabel,
  searchExercises,
  type SearchableExercise,
} from "@app/core/domain/exerciseSearch";
import { ALL_EQUIPMENT, ALL_MUSCLE_GROUPS } from "@app/core/domain/types";
import type { EquipmentType, MuscleGroup } from "@app/core/domain/types";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "@/lib/i18n";
import { equipmentLabelFromDomain, muscleLabelFromDomain } from "@/lib/labels";
import ExerciseFinderWizard, { type WizardResult } from "./ExerciseFinderWizard";
import type { PickInfo } from "./ExercisePicker";
import { Pictogram } from "./Pictogram";
import { Button } from "./ui/Button";
import { Chip } from "./ui/Chip";
import { FilterRow } from "./ui/FilterRow";
import { Icon } from "./ui/Icon";
import { TextField } from "./ui/inputs";
import { AppText, EmptyState } from "./ui/primitives";
import { trackUsage } from "@/lib/usage";

type Repo = typeof import("@app/core/data/exerciseRepository");
type Row = SearchableExercise & {
  nameEn: string | null;
  equipment: EquipmentType;
  primaryMuscles: MuscleGroup[];
  kind: string | null;
};

export type Pick = { exerciseId: string; info?: PickInfo };

export default function ExercisePickerScreen({
  mode,
  title,
  onDone,
  onClose,
  catalogOnly = false,
}: {
  mode: "multi" | "single";
  title: string;
  /** 고른 종목들 — multi 는 고른 순서, single 은 한 개. */
  onDone: (picks: Pick[]) => void;
  onClose: () => void;
  /** 카탈로그 종목만(직접 만든 종목 빼기) — 코치 초안은 회원 기기에 없는 종목을 보낼 수 없다(SPEC-050 P3b). */
  catalogOnly?: boolean;
}) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [repo, setRepo] = useState<Repo | null>(null);
  const [query, setQuery] = useState("");
  // 검색어는 싣지 않는다. 글자마다 세지 않게 1분에 한 번.
  useEffect(() => {
    if (query.trim()) trackUsage("exercise_search", { throttleMs: 60_000 });
  }, [query]);
  const [equipment, setEquipment] = useState<EquipmentType | "">("");
  const [muscle, setMuscle] = useState<MuscleGroup | "">("");
  const [kind, setKind] = useState<"cardio" | "">("");
  const [names, setNames] = useState<string[] | null>(null);
  const [finderLabel, setFinderLabel] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  // 고른 종목 — Map 은 넣은 순서를 지킨다(= 루틴에 들어갈 순서)
  const [picked, setPicked] = useState<Map<string, PickInfo | undefined>>(() => new Map());

  useEffect(() => setRoot(document.getElementById("modal-root")), []);

  useEffect(() => {
    let cancelled = false;
    void import("@app/core/data/exerciseRepository").then((m) => {
      if (!cancelled) setRepo(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 뒤 화면이 같이 스크롤되지 않게
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // 닫기·고르기 콜백은 ref 로 — 부모가 그릴 때마다 새 함수를 줘도 아래 효과(뒤로 가기 칸)를 다시 걸지 않는다
  const onCloseRef = useRef(onClose);
  const onDoneRef = useRef(onDone);
  onCloseRef.current = onClose;
  onDoneRef.current = onDone;

  // Esc 로 닫기 — 도우미가 떠 있으면 도우미가 먼저 닫힌다(그 시트가 자기 Esc 를 듣는다).
  // 한글 조합 중의 Esc 는 조합 취소다 — 피커를 닫아 고른 것을 날리지 않는다(qa code L)
  useEffect(() => {
    if (wizardOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing) onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [wizardOpen]);

  // 뒤로 가기 = 피커 닫기(qa code M-4) — 열 때 한 칸 쌓고, 버튼·고르기로 닫으면 그 칸을 되돌린다(WeighInSheet 와 같은 방식).
  // 우리 칸(history.state.liftgramPicker)이 맨 위일 때만 걷는다 — 바로 뒤의 이동을 되돌리지 않게.
  // 칸마다 고유 토큰(liftgramTop) — 위에 다른 시트(체크인)가 칸을 쌓았다 닫혀 우리 칸으로 돌아온 popstate 는 무시하고,
  // 닫을 때도 맨 위가 우리 칸일 때만 걷는다(qa M-3 · WeighInSheet 와 같은 규약).
  useEffect(() => {
    let pushed = true;
    const token = `picker-${Math.random().toString(36).slice(2)}`;
    history.pushState({ ...(history.state ?? {}), liftgramPicker: true, liftgramTop: token }, "");
    const onPop = () => {
      if (history.state?.liftgramTop === token) return; // 위 칸이 닫혀 우리 칸으로 돌아왔다
      pushed = false;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (pushed && history.state?.liftgramTop === token) history.back();
    };
  }, []);

  // 포커스(qa code M-3): 열 때 덮개로 옮기고, Tab 은 덮개 안에서만 돌고, 닫으면 연 버튼으로 돌려준다
  const dialogRef = useRef<HTMLDivElement>(null);
  // 포털 자리(root)가 잡힌 뒤에야 덮개가 그려진다 — 그때 옮긴다(첫 그림엔 덮개가 없어 옮기지 못했다 · qa L-7)
  const openerRef = useRef<HTMLElement | null>(null);
  if (openerRef.current === null && typeof document !== "undefined") {
    openerRef.current = document.activeElement as HTMLElement | null;
  }
  useEffect(() => {
    if (root) dialogRef.current?.focus();
  }, [root]);
  useEffect(() => {
    const opener = openerRef.current;
    return () => opener?.focus?.();
  }, []);
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || wizardOpen) return;
    const el = dialogRef.current;
    if (!el) return;
    const items = [...el.querySelectorAll<HTMLElement>("button:not([disabled]), input, [href]")].filter(
      (x) => x.offsetParent !== null,
    );
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // 기구·부위·유산소는 쿼리로, 검색은 JS 로(LokiJS 의 Q.like 가 한글을 못 거른다 — CatalogClient 와 같은 이유)
  const models = useQueryData(
    () =>
      repo
        ? repo.queryExercises({ equipment: equipment || null, muscle: muscle || null, kind: kind || null })
        : null,
    [repo, equipment, muscle, kind],
  );

  const list = useMemo(() => {
    // [원본] const all = models.map((m) => m as unknown as Row);
    const all = models
      .map((m) => m as unknown as Row & { isCustom?: boolean })
      .filter((e) => !catalogOnly || !e.isCustom);
    if (!names) return all;
    const keep = new Set(names);
    return all.filter((e) => keep.has(e.id));
  }, [models, names, catalogOnly]);
  const byId = useMemo(() => new Map(list.map((e) => [e.id, e])), [list]);
  const index = useMemo(() => buildExerciseSearchIndex(list), [list]);
  const searching = query.trim().length > 0;
  const { rows, similar } = useMemo(() => {
    if (!searching) {
      return {
        rows: [...list]
          .sort((a, b) => compareKoFirst(a.nameKo, b.nameKo))
          .map((e) => ({ e, info: undefined, alias: null })),
        similar: [] as Row[],
      };
    }
    const r = searchExercises(index, query);
    return {
      rows: r.hits.flatMap((h) => {
        const e = byId.get(h.id);
        return e
          ? [
              {
                e,
                info: { matched: h.matched, matchedKind: h.matchedKind, exact: h.exact } as PickInfo,
                alias: matchedLabel(h, e.nameKo),
              },
            ]
          : [];
      }),
      similar: r.similar.flatMap((id) => {
        const e = byId.get(id);
        return e ? [e] : [];
      }),
    };
  }, [searching, list, index, query, byId]);

  const order = useMemo(() => [...picked.keys()], [picked]);

  // 줄마다 같은 함수 — 한 줄을 눌러도 다른 줄(memo)은 다시 그리지 않는다(qa code M-6)
  const press = useCallback(
    (id: string, info: PickInfo | undefined) => {
      if (mode === "single") {
        onDoneRef.current([{ exerciseId: id, info }]);
        return;
      }
      setPicked((prev) => {
        const next = new Map(prev);
        if (next.has(id)) next.delete(id);
        else next.set(id, info);
        return next;
      });
    },
    [mode],
  );

  const hasFilter = equipment !== "" || muscle !== "" || kind !== "" || names !== null;
  const clearFilters = () => {
    setEquipment("");
    setMuscle("");
    setKind("");
    setNames(null);
    setFinderLabel(null);
  };
  const onWizardDone = (r: WizardResult) => {
    setMuscle(r.muscle ?? "");
    setEquipment(r.equipment ?? "");
    setKind(r.kind === "cardio" ? "cardio" : "");
    setNames(r.ids);
    setFinderLabel(r.ids || r.muscle || r.kind ? r.label : null);
    setQuery("");
    setWizardOpen(false);
  };

  if (!root) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="picker-screen"
      ref={dialogRef}
      tabIndex={-1}
      onKeyDown={trapTab}
      className="fixed inset-0 z-[45] flex justify-center bg-(--color-bg) outline-none"
    >
      <div data-testid="exercise-picker" className="flex w-full max-w-[560px] flex-col bg-(--color-surface)">
        <header className="flex min-h-14 shrink-0 items-center border-(--color-line) border-b px-[var(--spacing-xs)] pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            aria-label={t("common.close")}
            data-testid="picker-close"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center"
          >
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </button>
          <h1 className="flex-1 text-center font-semibold text-[length:var(--text-md)]">{title}</h1>
          {/* 제목을 가운데에 두려고 왼쪽 버튼만큼 비운다 */}
          <span className="h-11 w-11" aria-hidden />
        </header>

        <div className="flex-1 overflow-y-auto px-[var(--spacing-lg)] pt-[var(--spacing-md)] pb-[var(--spacing-xl)]">
          <div className="flex flex-col gap-[var(--spacing-sm)]">
            <TextField
              testId="picker-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("exercises.searchPlaceholder")}
              className="mb-0!"
            />

            <div className="flex items-center">
              <button
                type="button"
                data-testid="picker-wizard"
                onClick={() => setWizardOpen(true)}
                className="flex min-h-[32px] items-center gap-[4px] rounded-[var(--radius-pill)] bg-(--color-surface-alt) px-[var(--spacing-sm)] py-[var(--spacing-xs)]"
              >
                <Icon name="compass-outline" size={16} color="var(--color-ink2)" />
                <AppText variant="caption" color="textMuted" className="font-semibold">
                  {t("wizard.open")}
                </AppText>
              </button>
              {hasFilter ? (
                <button
                  type="button"
                  data-testid="picker-filter-reset"
                  onClick={clearFilters}
                  className="ml-[var(--spacing-md)] flex items-center gap-[3px] py-[var(--spacing-xs)]"
                >
                  <Icon name="close-circle" size={14} color="var(--color-ink2)" />
                  <AppText variant="caption" color="textMuted">
                    {t("wizard.reset")}
                  </AppText>
                </button>
              ) : null}
            </div>

            {finderLabel ? (
              <div className="flex items-center gap-[4px]">
                <Icon name={kind === "cardio" ? "heart" : "funnel"} size={13} color="var(--color-brand)" />
                <AppText variant="caption" color="primary" className="truncate">
                  {t("wizard.finderActive", { path: finderLabel })}
                </AppText>
              </div>
            ) : null}

            <FilterRow label={t("exercises.muscleFilter")}>
              {ALL_MUSCLE_GROUPS.map((m) => (
                <Chip
                  key={m}
                  testId={`picker-chip-muscle-${m}`}
                  label={muscleLabelFromDomain(m)}
                  active={muscle === m && kind !== "cardio"}
                  onPress={() => {
                    setNames(null);
                    setFinderLabel(null);
                    setKind("");
                    setMuscle((prev) => (prev === m ? "" : m));
                  }}
                />
              ))}
              <Chip
                testId="picker-chip-kind-cardio"
                label={t("wizard.cardio")}
                active={kind === "cardio"}
                onPress={() => {
                  setNames(null);
                  setFinderLabel(null);
                  setMuscle("");
                  setKind((prev) => (prev === "cardio" ? "" : "cardio"));
                }}
              />
            </FilterRow>

            <FilterRow label={t("exercises.equipmentFilter")}>
              {ALL_EQUIPMENT.map((e) => (
                <Chip
                  key={e}
                  testId={`picker-chip-equipment-${e}`}
                  label={equipmentLabelFromDomain(e)}
                  active={equipment === e}
                  onPress={() => {
                    setNames(null);
                    setFinderLabel(null);
                    setEquipment((prev) => (prev === e ? "" : e));
                  }}
                />
              ))}
            </FilterRow>

            {rows.length === 0 && similar.length === 0 ? (
              <EmptyState
                icon="search-outline"
                title={repo ? t("exercises.emptyTitle") : "종목을 불러오는 중입니다"}
                message={repo ? t("exercises.emptyMessage") : "잠시만 기다려 주세요"}
              />
            ) : (
              <ul
                data-testid="picker-list"
                className="mt-[var(--spacing-xs)] overflow-hidden rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-card) [&>li+li]:border-(--color-line) [&>li+li]:border-t"
              >
                {rows.map(({ e, info, alias }) => (
                  <li key={e.id}>
                    <PickRow
                      e={e}
                      info={info}
                      alias={alias}
                      mode={mode}
                      position={order.indexOf(e.id)}
                      onPress={press}
                    />
                  </li>
                ))}
              </ul>
            )}

            {searching && similar.length ? (
              // 비슷한 운동 — 같은 동작의 다른 기구·비슷한 동작(SRS-056). 결과와 섞지 않고 아래 구역으로.
              <div data-testid="picker-similar" className="mt-[var(--spacing-sm)]">
                <AppText variant="label" color="textFaint" className="block pb-[var(--spacing-xs)]">
                  비슷한 운동
                </AppText>
                <ul className="overflow-hidden rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-card) [&>li+li]:border-(--color-line) [&>li+li]:border-t">
                  {similar.map((e) => (
                    <li key={e.id}>
                      <PickRow
                        e={e}
                        info={undefined}
                        alias={null}
                        mode={mode}
                        position={order.indexOf(e.id)}
                        onPress={press}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>

        {mode === "multi" ? (
          <div className="shrink-0 border-(--color-line) border-t bg-(--color-surface) px-[var(--spacing-lg)] pt-[var(--spacing-md)] pb-[calc(var(--spacing-md)+env(safe-area-inset-bottom))]">
            <Button
              title={
                picked.size > 0
                  ? t("routines.pickerAddN", { n: picked.size })
                  : t("routines.pickerSelectPrompt")
              }
              icon="add"
              disabled={picked.size === 0}
              testId="picker-confirm"
              onPress={() => onDoneRef.current(order.map((id) => ({ exerciseId: id, info: picked.get(id) })))}
            />
          </div>
        ) : null}
      </div>

      <ExerciseFinderWizard visible={wizardOpen} onClose={() => setWizardOpen(false)} onDone={onWizardDone} />
    </div>,
    root,
  );
}

/** 줄 하나 — 그림 · 이름 · 「부위 · 기구 · 맞은 별칭」 · (multi) 고른 순서 번호 / (single) 화살표. */
const PickRow = memo(function PickRow({
  e,
  info,
  alias,
  mode,
  position,
  onPress,
}: {
  e: Row;
  /** 이 줄을 고를 때 넘길 검색 정보(검색 중일 때만) */
  info: PickInfo | undefined;
  alias: string | null;
  mode: "multi" | "single";
  /** 고른 순서(0부터) · 안 골랐으면 -1 */
  position: number;
  onPress: (id: string, info: PickInfo | undefined) => void;
}) {
  const item = { nameKo: e.nameKo, nameEn: e.nameEn, equipment: e.equipment };
  const selected = position >= 0;
  return (
    <button
      type="button"
      data-testid={`pick-${e.id}`}
      aria-pressed={mode === "multi" ? selected : undefined}
      onClick={() => onPress(e.id, info)}
      className={`flex min-h-[60px] w-full items-center gap-[var(--spacing-md)] px-[var(--spacing-md)] py-[var(--spacing-sm)] text-left active:bg-(--color-surface-alt) ${
        selected ? "bg-(--color-brand-muted)" : ""
      }`}
    >
      {hasPictogram(e.id) ? (
        <span className="h-10 w-12 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-(--color-surface-alt)">
          <Pictogram exerciseId={e.id} className="h-full w-full" />
        </span>
      ) : (
        <span className="flex h-10 w-12 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-(--color-surface-alt)">
          <Icon name="barbell-outline" size={18} color="var(--color-ink3)" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-(--color-ink) text-[length:var(--text-md)]">
          {exerciseListName(item)}
        </span>
        <span className="truncate text-(--color-ink2) text-[length:var(--text-sm)]">
          {[
            e.kind === "cardio"
              ? t("wizard.cardio")
              : (e.primaryMuscles ?? []).map((m) => muscleLabelFromDomain(m)).join("·"),
            equipmentLabelFromDomain(e.equipment),
            alias ? null : exerciseAltName(item),
          ]
            .filter(Boolean)
            .join(" · ")}
          {/* 검색이 대표 이름이 아닌 말(별칭·영문)로 맞았으면 그 말 — 「· 롱풀」 */}
          {alias ? <span data-testid="pick-alias"> · {alias}</span> : null}
        </span>
      </span>
      {mode === "multi" ? (
        <span
          data-testid={selected ? "pick-order" : undefined}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 font-bold text-[length:var(--text-sm)] ${
            selected
              ? "border-(--color-brand) bg-(--color-brand) text-(--color-on-brand)"
              : "border-(--color-line-strong)"
          }`}
        >
          {selected ? position + 1 : ""}
        </span>
      ) : (
        <Icon name="chevron-forward" size={18} color="var(--color-ink3)" />
      )}
    </button>
  );
});
