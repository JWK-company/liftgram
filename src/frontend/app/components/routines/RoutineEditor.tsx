"use client";
// @plm SRS-003  루틴 편집기 — app의 features/routines/RoutineEditorScreen.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
//   머리   이름 · 폴더(칩 또는 입력) · 메모
//   종목   행마다 세트·휴식·무게 스테퍼 + 처방 칩 + 변형 칩 + 슈퍼셋/대체/삭제
//   발     운동 추가 · 완료 · 루틴 삭제
//
// ── 저장 방식(app과 같다) ───────────────────────────────────────────────────
// 각 칸은 **고치는 즉시** 저장된다(blur 커밋). "완료"는 타이핑 중이던 값을 확정하고 나가는 버튼이지
// 이때 처음 저장되는 것이 아니다 — 헬스장에서 앱이 죽어도 방금 고친 값이 남아야 하기 때문이다.
//
// ── 새 루틴을 언제 만드는가 ─────────────────────────────────────────────────
// app은 화면에 들어오는 순간 초안을 만들고, 아무것도 안 하고 나가면 뒤로가기 훅에서 지운다.
// 웹에는 그 훅이 없다(주소창·뒤로가기·탭 닫기로도 나갈 수 있다). 그래서 **첫 변경이 생길 때까지
// 만들지 않는다** — 결과는 같고(빈 초안이 쌓이지 않는다) 지우는 코드가 필요 없다.
// ─────────────────────────────────────────────────────────────────────────────
import {
  cardioMetricsFor,
  fromKg,
  inputToIncline,
  inputToLevel,
  inputToSpeed,
  kmInputToM,
  mToKmInput,
  minInputToSec,
  secToMinInput,
  toKg,
  type CardioMetric,
  type EquipmentType,
  type PrescribedSet,
  type VariantDims,
} from "@app/core";
import { useQueryData } from "@app/core/db/hooks";
import { useUser } from "@app/core/state/userContext";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { scheduleFlush } from "@/lib/localDb";
import ExercisePicker from "../ExercisePicker";
import { useToast } from "../Toast";
import { Button } from "../ui/Button";
import { ConfirmDialog, SheetShell } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { NumberStepper, TextField } from "../ui/inputs";
import { AppText, Card, Divider, EmptyState, SectionHeader, Tag } from "../ui/primitives";
import { VariantSelector } from "../ui/VariantSelector";
import { ExerciseName } from "../session/ExerciseName";
import { PrescriptionRows, emptyRxRow, rxSummary } from "./PrescriptionRows";

type RoutineRepo = typeof import("@app/core/data/routineRepository");

/** 이 화면이 모델에서 읽는 것만. */
interface RoutineExerciseRow {
  id: string;
  exerciseId: string;
  targetSets: number;
  restSeconds: number;
  targetWeightKg: number | null;
  supersetGroup: string | null;
  variant: VariantDims | null;
  prescription: PrescribedSet[] | null;
  cardioTarget: {
    durationSec?: number | null;
    distanceM?: number | null;
    incline?: number | null;
    level?: number | null;
    speed?: number | null;
  } | null;
}

export default function RoutineEditor({ routineId: paramId }: { routineId: string | null }) {
  const toast = useToast();
  const [repo, setRepo] = useState<RoutineRepo | null>(null);
  const [routineId, setRoutineId] = useState<string | null>(paramId);
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [notes, setNotes] = useState("");
  const [folderOptions, setFolderOptions] = useState<string[]>([]);
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(0);
  const [picking, setPicking] = useState<null | { mode: "add" } | { mode: "swap"; reId: string }>(null);
  const [supersetTarget, setSupersetTarget] = useState<RoutineExerciseRow | null>(null);
  const [confirmDeleteRoutine, setConfirmDeleteRoutine] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<RoutineExerciseRow | null>(null);

  // 만들기가 두 번 겹치지 않게 하는 자물쇠(빠르게 두 번 누르거나 개발 모드의 이중 실행 대비).
  const creatingRef = useRef<Promise<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await import("@app/core/data/routineRepository");
      if (cancelled) return;
      setRepo(r);

      const folders = await r.getFolderNames().catch(() => []);
      if (cancelled) return;
      setFolderOptions(folders);

      if (paramId) {
        const routine = (await r.getRoutine(paramId)) as unknown as {
          name: string;
          folder: string | null;
          notes: string | null;
        };
        if (cancelled) return;
        setName(routine.name ?? "");
        setFolder(routine.folder ?? "");
        setNotes(routine.notes ?? "");
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [paramId]);

  /** 메모리에만 있는 변경을 디스크로 — 완료를 누르면 곧바로 다른 화면으로 넘어가기 때문이다. */
  const flush = useCallback(async () => {
    const { flushLocalDb } = await import("@/lib/localDb");
    await flushLocalDb();
  }, []);

  /** 저장할 것이 생겼을 때 비로소 루틴을 만든다. 이미 있으면 그 id를 그대로 준다. */
  const ensureId = useCallback(async (): Promise<string | null> => {
    if (routineId) return routineId;
    if (!repo) return null;
    if (!creatingRef.current) {
      creatingRef.current = repo
        .createRoutine({ name: name.trim() || t("routines.newRoutineName") })
        .then((r) => (r as unknown as { id: string }).id);
    }
    const id = await creatingRef.current;
    setRoutineId(id);
    return id;
  }, [repo, routineId, name]);

  const models = useQueryData(
    () => (repo && routineId ? repo.queryRoutineExercises(routineId) : null),
    [repo, routineId, version],
  );
  const exercises = models.map((m) => m as unknown as RoutineExerciseRow);

  const save = useCallback(
    async (patch: { name?: string; folder?: string | null; notes?: string | null }) => {
      if (!repo) return;
      const id = await ensureId();
      if (!id) return;
      await repo.updateRoutine(id, patch).catch(() => {});
      await flush();
    },
    [repo, ensureId, flush],
  );

  if (!loaded || !repo) {
    return (
      <div className="flex flex-1 items-center justify-center p-[var(--spacing-xl)]">
        <AppText variant="body" color="textMuted">
          {t("common.loading")}
        </AppText>
      </div>
    );
  }

  const pickFolder = (next: string) => {
    setFolder(next);
    setNewFolderMode(false);
    void save({ folder: next.trim() || null });
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 flex items-center justify-between border-(--color-line) border-b bg-(--color-surface) px-[var(--spacing-md)] py-[var(--spacing-sm)]">
        <a
          href="/"
          aria-label={t("routines.editorTitle")}
          className="flex h-10 w-10 items-center justify-center"
        >
          <Icon name="chevron-back" size={22} color="var(--color-ink)" />
        </a>
        <AppText variant="heading">{t("routines.editorTitle")}</AppText>
        {/* 제목을 가운데 두기 위한 자리 — 완료 버튼은 아래에 있다(app과 같다). */}
        <span className="w-10" />
      </header>

      <div className="flex-1 p-[var(--spacing-lg)]">
        <TextField
          testId="routine-name"
          label={t("routines.nameLabel")}
          placeholder={t("routines.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && save({ name: name.trim() })}
        />

        {/* 폴더 — 이미 만든 폴더가 있으면 칩으로 고르고, 없으면 그냥 입력한다. */}
        {folderOptions.length === 0 && !newFolderMode ? (
          <TextField
            testId="routine-folder"
            label={t("routines.folderLabel")}
            placeholder={t("routines.folderPlaceholder")}
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            onBlur={() => folder.trim() && save({ folder: folder.trim() })}
          />
        ) : (
          <div className="mb-[var(--spacing-md)]">
            <AppText variant="label" color="textMuted" className="mb-[4px] block">
              {t("routines.folderLabel")}
            </AppText>
            <div className="flex flex-wrap gap-[4px]">
              <FolderChip label={t("routines.folderNone")} active={!folder} onPress={() => pickFolder("")} />
              {folderOptions.map((f) => (
                <FolderChip
                  key={f}
                  label={f}
                  icon="folder-outline"
                  active={folder === f}
                  onPress={() => pickFolder(f)}
                />
              ))}
              <FolderChip
                label={t("routines.folderNew")}
                icon="add"
                active={newFolderMode}
                onPress={() => {
                  setFolder("");
                  setNewFolderMode(true);
                }}
              />
            </div>
            {newFolderMode ? (
              <div className="mt-[var(--spacing-sm)]">
                <TextField
                  testId="routine-folder-new"
                  placeholder={t("routines.folderNewPlaceholder")}
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  // 새 폴더를 만들려고 연 입력이라 바로 칠 수 있어야 한다
                  autoFocus
                  onBlur={() => {
                    const v = folder.trim();
                    void save({ folder: v || null });
                    if (v) {
                      setFolderOptions((opts) =>
                        opts.includes(v) ? opts : [...opts, v].sort((a, b) => a.localeCompare(b, "ko")),
                      );
                      setNewFolderMode(false);
                    }
                  }}
                />
              </div>
            ) : null}
          </div>
        )}

        <TextField
          testId="routine-notes"
          label={t("routines.notesLabel")}
          placeholder={t("routines.notesPlaceholder")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes.trim() && save({ notes: notes.trim() })}
        />

        <Divider />
        <SectionHeader title={t("routines.exercisesSection")} />

        {exercises.length === 0 ? (
          <EmptyState
            icon="add-circle"
            title={t("routines.editorEmptyTitle")}
            message={t("routines.editorEmptyMessage")}
          />
        ) : (
          <div data-testid="routine-exercises">
            {exercises.map((re, i) => (
              <ExerciseEditRow
                key={re.id}
                re={re}
                index={i}
                total={exercises.length}
                repo={repo}
                onSwap={() => setPicking({ mode: "swap", reId: re.id })}
                onRemove={() => setConfirmRemove(re)}
                onSuperset={() => setSupersetTarget(re)}
                onUnsuperset={() => {
                  const members = exercises.filter((x) => x.supersetGroup === re.supersetGroup);
                  const ids = members.length <= 2 ? members.map((m) => m.id) : [re.id];
                  void repo.ungroupSuperset(ids).then(() => {
                    scheduleFlush();
                    setVersion((v) => v + 1);
                  });
                }}
              />
            ))}
          </div>
        )}

        <div className="mt-[var(--spacing-md)]">
          <Button
            title={t("routines.addExercise")}
            icon="add"
            variant="secondary"
            testId="btn-add-routine-exercise"
            onPress={() => setPicking({ mode: "add" })}
          />
        </div>

        {picking ? (
          <div className="mt-[var(--spacing-md)]">
            <ExercisePicker
              onClose={() => setPicking(null)}
              onPick={(exerciseId) => {
                const p = picking;
                setPicking(null);
                void (async () => {
                  if (p.mode === "swap") {
                    await repo.swapRoutineExercise(p.reId, exerciseId);
                  } else {
                    const id = await ensureId();
                    if (id) await repo.addExerciseToRoutine(id, exerciseId);
                  }
                  await flush();
                  setVersion((v) => v + 1);
                })();
              }}
            />
          </div>
        ) : null}

        <Divider />

        <div className="mt-[var(--spacing-sm)]">
          <Button
            title={t("common.done")}
            icon="checkmark"
            testId="btn-routine-done"
            onPress={() => {
              void (async () => {
                // 타이핑 중이던 이름을 확정하고(포커스가 아직 입력에 있을 수 있다) 내려쓴 뒤 나간다.
                if (name.trim()) await save({ name: name.trim() });
                const { navigateAfterFlush } = await import("@/lib/localDb");
                await navigateAfterFlush("/");
              })();
            }}
          />
        </div>
        <div className="mt-[var(--spacing-sm)]">
          <Button
            title={t("routines.deleteRoutineTitle")}
            variant="danger"
            testId="btn-delete-routine"
            onPress={() => setConfirmDeleteRoutine(true)}
          />
        </div>
      </div>

      {supersetTarget ? (
        <SheetShell
          title={t("routines.supersetPickTitle")}
          onClose={() => setSupersetTarget(null)}
          hideOk
          testId="routine-superset-sheet"
        >
          <div className="mt-[var(--spacing-sm)] max-h-[360px] overflow-y-auto">
            {exercises.filter((x) => x.id !== supersetTarget.id).length === 0 ? (
              <AppText variant="caption" color="textMuted">
                {t("routines.supersetNoPartner")}
              </AppText>
            ) : (
              exercises
                .filter((x) => x.id !== supersetTarget.id)
                .map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    data-testid="routine-superset-option"
                    onClick={() => {
                      const ids = new Set<string>([supersetTarget.id, x.id]);
                      for (const m of exercises) {
                        if (
                          m.supersetGroup &&
                          (m.supersetGroup === supersetTarget.supersetGroup ||
                            m.supersetGroup === x.supersetGroup)
                        )
                          ids.add(m.id);
                      }
                      setSupersetTarget(null);
                      void repo.groupAsSuperset([...ids]).then(() => {
                        scheduleFlush();
                        setVersion((v) => v + 1);
                      });
                    }}
                    className="flex w-full items-center justify-between border-(--color-line) border-b py-[var(--spacing-sm)] text-left"
                  >
                    <ExerciseName exerciseId={x.exerciseId} variant="body" base />
                    {x.supersetGroup ? <Tag label={t("routines.supersetTag")} tone="primary" /> : null}
                  </button>
                ))
            )}
          </div>
          <div className="mt-[var(--spacing-md)]">
            <Button title={t("common.cancel")} variant="secondary" onPress={() => setSupersetTarget(null)} />
          </div>
        </SheetShell>
      ) : null}

      {confirmRemove ? (
        <ConfirmDialog
          testId="confirm-remove-routine-exercise"
          title={t("routines.removeExerciseTitle")}
          message={t("routines.removeExerciseMessage")}
          confirmLabel={t("common.delete")}
          destructive
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => {
            const target = confirmRemove;
            setConfirmRemove(null);
            void repo
              .removeRoutineExercise(target.id)
              .then(flush)
              .catch((e) => toast(String(e), "error"));
          }}
        />
      ) : null}

      {confirmDeleteRoutine ? (
        <ConfirmDialog
          testId="confirm-delete-routine"
          title={t("routines.deleteRoutineTitle")}
          message={t("routines.deleteRoutineMessage")}
          confirmLabel={t("common.delete")}
          destructive
          onCancel={() => setConfirmDeleteRoutine(false)}
          onConfirm={() => {
            setConfirmDeleteRoutine(false);
            void (async () => {
              // 아직 만들어지지 않은 새 루틴이면 지울 것이 없다.
              if (routineId) await repo.deleteRoutine(routineId).catch(() => {});
              const { navigateAfterFlush } = await import("@/lib/localDb");
              await navigateAfterFlush("/");
            })();
          }}
        />
      ) : null}
    </div>
  );
}

function FolderChip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon?: "folder-outline" | "add";
  active: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      style={{
        backgroundColor: active ? "var(--color-brand-muted)" : "var(--color-surface-alt)",
        borderColor: active ? "var(--color-brand)" : "var(--color-line)",
      }}
      className="flex items-center gap-[4px] rounded-[var(--radius-md)] border px-[var(--spacing-sm)] py-[6px]"
    >
      {icon ? (
        <Icon name={icon} size={12} color={active ? "var(--color-brand)" : "var(--color-ink2)"} />
      ) : null}
      <AppText variant="caption" color={active ? "primary" : "text"}>
        {label}
      </AppText>
    </button>
  );
}

/** 루틴 안의 종목 한 줄 — 세트·휴식·무게·처방·변형을 여기서 정한다. */
function ExerciseEditRow({
  re,
  index,
  total,
  repo,
  onSwap,
  onRemove,
  onSuperset,
  onUnsuperset,
}: {
  re: RoutineExerciseRow;
  index: number;
  total: number;
  repo: RoutineRepo;
  onSwap: () => void;
  onRemove: () => void;
  onSuperset: () => void;
  onUnsuperset: () => void;
}) {
  const { weightUnit } = useUser();
  const [sets, setSets] = useState(re.targetSets);
  const [rest, setRest] = useState(re.restSeconds);
  const [weight, setWeight] = useState(() => (re.targetWeightKg ? fromKg(re.targetWeightKg, weightUnit) : 0));
  const [variant, setVariant] = useState<VariantDims>(() => re.variant ?? {});
  const [baseEquipment, setBaseEquipment] = useState<EquipmentType | null>(null);
  const [isCardio, setIsCardio] = useState(false);
  const [metrics, setMetrics] = useState<CardioMetric[]>([]);

  // 밖에서 바뀐 값(대체·복제)을 따라간다.
  useEffect(() => setSets(re.targetSets), [re.targetSets]);
  useEffect(() => setRest(re.restSeconds), [re.restSeconds]);
  useEffect(
    () => setWeight(re.targetWeightKg ? fromKg(re.targetWeightKg, weightUnit) : 0),
    [re.targetWeightKg, weightUnit],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const exRepo = await import("@app/core/data/exerciseRepository");
        const e = (await exRepo.getExercise(re.exerciseId)) as unknown as {
          equipment: EquipmentType;
          kind: string | null;
          nameEn: string | null;
        };
        if (!alive) return;
        setBaseEquipment(e.equipment);
        setIsCardio(e.kind === "cardio");
        setMetrics(cardioMetricsFor({ nameEn: e.nameEn }));
      } catch {
        // 삭제된 종목 — 기본값으로 둔다.
      }
    })();
    return () => {
      alive = false;
    };
  }, [re.exerciseId]);

  const grouped = !!re.supersetGroup;

  return (
    <Card className={`mb-[var(--spacing-md)] ${grouped ? "border-(--color-brand)!" : ""}`}>
      <div className="flex flex-col gap-[var(--spacing-md)]" data-testid={`re-${re.id}`}>
        <div className="flex items-center gap-[var(--spacing-sm)]">
          <div className="min-w-0 flex-1">
            <ExerciseName exerciseId={re.exerciseId} variant="body" base />
            <AppText variant="caption" color="textMuted" className="block">
              {isCardio
                ? t("routines.cardioRowLabel", { index: index + 1 })
                : t("routines.exerciseRowSummary", { index: index + 1, sets, rest })}
            </AppText>
            {!isCardio ? (
              <div className="mt-[4px] flex flex-wrap gap-[6px]">
                <VariantSelector
                  baseEquipment={baseEquipment}
                  value={variant}
                  onChange={(dims) => {
                    setVariant(dims);
                    void repo.setRoutineExerciseVariant(re.id, dims).then(scheduleFlush);
                  }}
                />
              </div>
            ) : null}
          </div>
          {grouped ? <Tag label={t("routines.supersetTag")} tone="primary" /> : null}
        </div>

        {isCardio ? (
          <CardioTargetFields re={re} metrics={metrics} repo={repo} />
        ) : (
          <>
            <div className="flex gap-[var(--spacing-lg)]">
              <Field label={t("routines.setsLabel")}>
                <NumberStepper
                  testId="re-sets"
                  value={sets}
                  min={1}
                  step={1}
                  onChange={(v) => {
                    setSets(v);
                    void repo.updateRoutineExercise(re.id, { targetSets: v }).then(scheduleFlush);
                  }}
                />
              </Field>
              <Field label={t("routines.restLabel")}>
                <NumberStepper
                  testId="re-rest"
                  value={rest}
                  min={0}
                  step={15}
                  onChange={(v) => {
                    setRest(v);
                    void repo.updateRoutineExercise(re.id, { restSeconds: v }).then(scheduleFlush);
                  }}
                />
              </Field>
            </div>

            <div className="flex gap-[var(--spacing-lg)]">
              <Field label={t("routines.weightLabel", { weightUnit })}>
                <NumberStepper
                  testId="re-weight"
                  value={weight}
                  min={0}
                  step={weightUnit === "kg" ? 2.5 : 5}
                  onChange={(v) => {
                    setWeight(v);
                    // 화면은 사용자 단위지만 **저장은 항상 kg**이다(단위를 바꿔도 기록이 흔들리지 않게).
                    void repo
                      .updateRoutineExercise(re.id, {
                        targetWeightKg: v > 0 ? toKg(v, weightUnit) : null,
                      })
                      .then(scheduleFlush);
                  }}
                />
              </Field>
              <span className="flex-1" />
            </div>

            <PrescriptionEditor re={re} repo={repo} onSaved={setSets} />
          </>
        )}

        <div className="flex items-center gap-[var(--spacing-xs)]">
          <span className="flex-1" />
          {total >= 2 ? (
            <Button
              title={grouped ? t("routines.supersetUnlink") : t("routines.supersetLink")}
              size="sm"
              variant="ghost"
              icon="git-merge-outline"
              fullWidth={false}
              testId="btn-re-superset"
              onPress={grouped ? onUnsuperset : onSuperset}
            />
          ) : null}
          <Button
            title={t("routines.swap")}
            size="sm"
            variant="ghost"
            fullWidth={false}
            testId="btn-re-swap"
            onPress={onSwap}
          />
          <IconButton
            icon="trash-outline"
            size={18}
            label={t("routines.removeExerciseTitle")}
            color="var(--color-bad)"
            testId="btn-re-remove"
            onPress={onRemove}
          />
        </div>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1">
      <AppText variant="label" color="textMuted" className="mb-[4px] block">
        {label}
      </AppText>
      {children}
    </div>
  );
}

/**
 * 유산소 목표 — 시간·거리·경사·단계·속도 중 **그 종목에 맞는 것만** 보여 준다.
 *
 * 어떤 지표를 쓸지는 도메인이 정한다(cardioMetricsFor). 저장 단위도 도메인 변환기를 그대로 쓴다:
 * 화면은 분·km, 저장은 초·m다.
 */
function CardioTargetFields({
  re,
  metrics,
  repo,
}: {
  re: RoutineExerciseRow;
  metrics: CardioMetric[];
  repo: RoutineRepo;
}) {
  const target = re.cardioTarget ?? {};
  const [vals, setVals] = useState<Record<string, string>>(() => ({
    duration: secToMinInput(target.durationSec ?? null),
    distance: mToKmInput(target.distanceM ?? null),
    incline: target.incline == null ? "" : String(target.incline),
    level: target.level == null ? "" : String(target.level),
    speed: target.speed == null ? "" : String(target.speed),
  }));

  const persist = () => {
    void repo
      .updateRoutineExercise(re.id, {
        cardioTarget: {
          durationSec: minInputToSec(vals.duration),
          distanceM: kmInputToM(vals.distance),
          incline: inputToIncline(vals.incline),
          level: inputToLevel(vals.level),
          speed: inputToSpeed(vals.speed),
        },
      })
      .then(scheduleFlush);
  };

  const LABEL: Record<CardioMetric, string> = {
    duration: t("routines.cardioDurationLabel"),
    distance: t("routines.cardioDistanceLabel"),
    incline: t("routines.cardioInclineLabel"),
    level: t("routines.cardioLevelLabel"),
    speed: t("routines.cardioSpeedLabel"),
  };

  return (
    <div className="flex flex-wrap gap-[var(--spacing-md)]">
      {metrics.map((m) => (
        <div key={m} className="min-w-[90px] grow basis-[30%]">
          <AppText variant="label" color="textMuted" className="mb-[4px] block">
            {LABEL[m]}
          </AppText>
          <input
            data-testid={`cardio-${m}`}
            inputMode="decimal"
            placeholder="0"
            value={vals[m] ?? ""}
            onChange={(e) => setVals((v) => ({ ...v, [m]: e.target.value }))}
            onBlur={persist}
            className="w-full rounded-[var(--radius-sm)] border border-(--color-line) bg-(--color-surface) px-[var(--spacing-md)] py-[var(--spacing-sm)] text-center text-[length:var(--text-md)] text-(--color-ink) placeholder:text-(--color-ink3)"
          />
        </div>
      ))}
    </div>
  );
}

/** 처방 칩 + 편집 시트 — 저장하면 세트 수가 처방 길이에 맞춰진다(저장소가 함께 갱신한다). */
function PrescriptionEditor({
  re,
  repo,
  onSaved,
}: {
  re: RoutineExerciseRow;
  repo: RoutineRepo;
  onSaved: (sets: number) => void;
}) {
  const [saved, setSaved] = useState<PrescribedSet[] | null>(re.prescription ?? null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PrescribedSet[]>([]);

  const summary = rxSummary(saved);

  return (
    <div className="mt-[var(--spacing-sm)]">
      <button
        type="button"
        data-testid="btn-rx"
        onClick={() => {
          setRows(saved?.length ? saved.map((r) => ({ ...r })) : [emptyRxRow()]);
          setOpen(true);
        }}
        style={{
          backgroundColor: summary ? "var(--color-brand-muted)" : "var(--color-surface-alt)",
          borderColor: summary ? "var(--color-brand)" : "var(--color-line)",
        }}
        className="flex items-center gap-[6px] self-start rounded-[var(--radius-pill)] border px-[var(--spacing-sm)] py-[4px]"
      >
        <Icon
          name="clipboard-outline"
          size={14}
          color={summary ? "var(--color-brand)" : "var(--color-ink2)"}
        />
        <AppText
          variant="caption"
          color={summary ? "primary" : "textMuted"}
          className={summary ? "font-bold" : ""}
        >
          {summary ? t("routines.rxSummary", { summary }) : t("routines.rxButton")}
        </AppText>
      </button>

      {open ? (
        <SheetShell title={t("routines.rxTitle")} onClose={() => setOpen(false)} hideOk testId="rx-sheet">
          <AppText variant="caption" color="textMuted" className="mt-[2px] mb-[var(--spacing-sm)] block">
            {t("routines.rxHint")}
          </AppText>
          <PrescriptionRows rows={rows} onChange={setRows} />
          <div className="mt-[var(--spacing-md)] flex gap-[var(--spacing-sm)]">
            <div className="flex-1">
              <Button title={t("common.cancel")} variant="secondary" onPress={() => setOpen(false)} />
            </div>
            <div className="flex-1">
              <Button
                title={t("common.save")}
                testId="btn-rx-save"
                onPress={() => {
                  // 한 행이라도 뜻이 있으면 처방으로 본다 — 전부 비어 있으면 처방 자체를 지운다.
                  const hasAny = rows.some(
                    (r) =>
                      r.setType !== "normal" || r.targetRir != null || r.repMin != null || r.repMax != null,
                  );
                  const next = hasAny ? rows : null;
                  void repo.setRoutineExercisePrescription(re.id, next).then(() => {
                    scheduleFlush();
                    setSaved(next);
                    if (hasAny) onSaved(rows.length);
                  });
                  setOpen(false);
                }}
              />
            </div>
          </div>
        </SheetShell>
      ) : null}
    </div>
  );
}
