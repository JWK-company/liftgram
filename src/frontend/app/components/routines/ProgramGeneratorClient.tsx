"use client";
// @plm SRS-009  프로그램 생성 — app의 features/routines/ProgramGeneratorScreen.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 목표·경력·장비·일수를 고르면 요일별 루틴을 **미리 보여 주고**, 마음에 들 때만 채택한다.
// 생성 규칙은 전부 `core/data/programRepository`에 있다 — 서버가 없어도 돌아간다.
//
// ── 왜 미리보기가 있나 ──────────────────────────────────────────────────────
// 자동 생성이 바로 내 루틴이 되면, 마음에 안 드는 종목 하나 때문에 전부 지우게 된다.
// 그래서 **교체(다음 후보로 회전)** 와 **제외**를 미리보기에서 하고, 그 결과만 채택한다.
//
// ── 모드를 바꾸면 미리보기를 버린다 ─────────────────────────────────────────
// 조건이 바뀌었는데 옛 결과가 남아 있으면, 지금 화면이 무엇의 결과인지 알 수 없다.
// ─────────────────────────────────────────────────────────────────────────────
import {
  ALL_EQUIPMENT,
  equipmentLabel,
  muscleLabel,
  type EquipmentType,
  type MuscleGroup,
  type ProgramExperience,
  type ProgramGoal,
} from "@app/core";
import { useUser } from "@app/core/state/userContext";
import { useState } from "react";
import { t, type TransKey } from "@/lib/i18n";
import { navigateAfterFlush } from "@/lib/localDb";
import { ExerciseName } from "../session/ExerciseName";
import { useToast } from "../Toast";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { Icon } from "../ui/Icon";
import { AppText, Card, Divider } from "../ui/primitives";
import { ScreenHeader } from "../ui/ScreenHeader";

interface EditSlot {
  /** [고른 것, ...대체 후보] — 교체는 이 고리를 한 칸 돌리는 것이다. */
  ring: string[];
  idx: number;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number;
}

interface EditDay {
  templateKey: string;
  nameKey: string;
  index: number;
  slots: EditSlot[];
  muscles?: MuscleGroup[];
}

type GenMode = "auto" | "custom";

const GOALS: ProgramGoal[] = ["strength", "hypertrophy", "endurance"];
const EXPERIENCES: ProgramExperience[] = ["beginner", "intermediate", "advanced"];
const DAYS = [2, 3, 4, 5, 6];
const SPLIT_COUNTS = [2, 3, 4, 5, 6];
/** 분할에 배정할 수 있는 근육군 — 전신·기타는 뺀다(개별 부위만). */
const SPLIT_MUSCLES: MuscleGroup[] = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "abs",
  "traps",
];

/** 분할 수에 따른 합리적 기본 배치. **결정적**이다 — 같은 수를 고르면 늘 같은 배치가 나온다. */
function defaultSplits(count: number): MuscleGroup[][] {
  const presets: Record<number, MuscleGroup[][]> = {
    2: [
      ["chest", "shoulders", "triceps", "abs"],
      ["back", "biceps", "quads", "hamstrings"],
    ],
    3: [
      ["chest", "shoulders", "triceps"],
      ["back", "biceps", "traps"],
      ["quads", "hamstrings", "glutes", "calves"],
    ],
    4: [
      ["chest", "triceps"],
      ["back", "biceps"],
      ["shoulders", "abs"],
      ["quads", "hamstrings", "glutes", "calves"],
    ],
    5: [
      ["chest", "triceps"],
      ["back", "biceps"],
      ["shoulders", "traps"],
      ["quads", "calves"],
      ["hamstrings", "glutes", "abs"],
    ],
    6: [
      ["chest"],
      ["back"],
      ["shoulders", "traps"],
      ["quads", "calves"],
      ["hamstrings", "glutes"],
      ["biceps", "triceps", "abs"],
    ],
  };
  return presets[count] ?? Array.from({ length: count }, () => [] as MuscleGroup[]);
}

export default function ProgramGeneratorClient() {
  const toast = useToast();
  const { availableEquipment } = useUser();

  const [mode, setMode] = useState<GenMode>("auto");
  const [goal, setGoal] = useState<ProgramGoal>("hypertrophy");
  const [experience, setExperience] = useState<ProgramExperience>("intermediate");
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [splitCount, setSplitCount] = useState(3);
  const [splitMuscles, setSplitMuscles] = useState<MuscleGroup[][]>(() => defaultSplits(3));
  const [equipment, setEquipment] = useState<EquipmentType[]>(availableEquipment);
  const [days, setDays] = useState<EditDay[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [adopting, setAdopting] = useState(false);

  function changeMode(m: GenMode) {
    setMode(m);
    setDays(null); // 조건이 바뀌었으니 옛 미리보기는 버린다
  }

  function changeSplitCount(n: number) {
    setSplitCount(n);
    setSplitMuscles(defaultSplits(n));
    setDays(null);
  }

  async function generate() {
    const cleaned = splitMuscles.filter((s) => s.length > 0);
    if (mode === "custom" && cleaned.length === 0) {
      toast(t("program.splitMusclesHint"), "error");
      return;
    }
    setGenerating(true);
    try {
      const programRepo = await import("@app/core/data/programRepository");
      const program =
        mode === "custom"
          ? await programRepo.buildFromSplits({ splits: cleaned, equipment, goal, experience })
          : await programRepo.buildProgram({ goal, experience, daysPerWeek, equipment });
      setDays(
        program.days.map((d) => ({
          templateKey: d.templateKey,
          nameKey: d.nameKey,
          index: d.index,
          muscles: d.muscles,
          slots: d.slots.map((s) => ({
            ring: [s.exerciseId, ...s.alternatives],
            idx: 0,
            targetSets: s.targetSets,
            targetRepsMin: s.targetRepsMin,
            targetRepsMax: s.targetRepsMax,
            restSeconds: s.restSeconds,
          })),
        })),
      );
    } catch {
      toast(t("common.error"), "error");
    } finally {
      setGenerating(false);
    }
  }

  /** 교체 = 후보 고리를 한 칸 돌린다. 후보가 하나뿐이면 아무 일도 없다. */
  function swapSlot(di: number, si: number) {
    setDays((prev) => {
      if (!prev) return prev;
      const next = prev.map((d) => ({ ...d, slots: d.slots.map((s) => ({ ...s })) }));
      const slot = next[di].slots[si];
      if (slot.ring.length > 1) slot.idx = (slot.idx + 1) % slot.ring.length;
      return next;
    });
  }

  function removeSlot(di: number, si: number) {
    setDays((prev) => {
      if (!prev) return prev;
      const next = prev.map((d) => ({ ...d, slots: d.slots.slice() }));
      next[di].slots.splice(si, 1);
      return next;
    });
  }

  // 같은 템플릿이 두 번 이상 나오면 A/B/…를 붙인다(둘 다 "가슴"이면 구분이 안 된다).
  const repeated = new Set<string>();
  if (days) {
    const counts = new Map<string, number>();
    for (const d of days) counts.set(d.templateKey, (counts.get(d.templateKey) ?? 0) + 1);
    for (const [key, n] of counts) if (n > 1) repeated.add(key);
  }

  function dayName(d: EditDay): string {
    if (d.templateKey === "custom") {
      const names = (d.muscles ?? []).map((m) => muscleLabel(m, "ko"));
      return names.length ? names.join(" · ") : `${t("program.day.custom")} ${d.index + 1}`;
    }
    const base = t(d.nameKey as TransKey);
    return repeated.has(d.templateKey) ? `${base} ${String.fromCharCode(65 + d.index)}` : base;
  }

  const programName =
    mode === "custom"
      ? t("program.customName")
      : t("program.namePattern", { goal: t(`program.goal.${goal}` as TransKey), days: daysPerWeek });

  async function adopt() {
    if (!days || adopting) return;
    const routines = days
      .filter((d) => d.slots.length > 0)
      .map((d) => ({
        name: `${programName} · ${dayName(d)}`,
        slots: d.slots.map((s) => ({
          exerciseId: s.ring[s.idx],
          targetSets: s.targetSets,
          targetRepsMin: s.targetRepsMin,
          targetRepsMax: s.targetRepsMax,
          restSeconds: s.restSeconds,
        })),
      }));
    if (routines.length === 0) return;

    setAdopting(true);
    try {
      const programRepo = await import("@app/core/data/programRepository");
      await programRepo.adoptProgram(programName, routines);
      toast(t("program.adoptedMessage"));
      // 로컬 저장소가 내려쓰기 전에 옮겨 가면 방금 만든 루틴이 사라진다.
      await navigateAfterFlush("/");
    } catch {
      setAdopting(false);
      toast(t("common.error"), "error");
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("program.title")}
        back={
          <a href="/" aria-label={t("routines.title")} data-testid="program-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
      />

      <div className="flex-1 p-[var(--spacing-lg)]" data-testid="program-form">
        <AppText variant="caption" color="textMuted" className="mb-[var(--spacing-lg)] block">
          {t("program.intro")}
        </AppText>

        <ChipSelect
          label={t("program.mode")}
          options={(["auto", "custom"] as GenMode[]).map((m) => ({
            value: m,
            label: t(`program.mode.${m}` as TransKey),
          }))}
          value={mode}
          onChange={changeMode}
          testId="program-mode"
        />
        <ChipSelect
          label={t("program.goal")}
          options={GOALS.map((g) => ({ value: g, label: t(`program.goal.${g}` as TransKey) }))}
          value={goal}
          onChange={setGoal}
          testId="program-goal"
        />
        <ChipSelect
          label={t("program.experience")}
          options={EXPERIENCES.map((x) => ({ value: x, label: t(`program.experience.${x}` as TransKey) }))}
          value={experience}
          onChange={setExperience}
          testId="program-experience"
        />

        {mode === "auto" ? (
          <ChipSelect
            label={t("program.days")}
            options={DAYS.map((d) => ({ value: d, label: String(d) }))}
            value={daysPerWeek}
            onChange={setDaysPerWeek}
            testId="program-days"
          />
        ) : (
          <>
            <ChipSelect
              label={t("program.splitCount")}
              options={SPLIT_COUNTS.map((n) => ({ value: n, label: String(n) }))}
              value={splitCount}
              onChange={changeSplitCount}
              testId="program-split-count"
            />
            <div className="mb-[var(--spacing-lg)]">
              <AppText variant="caption" color="textFaint" className="mb-[var(--spacing-sm)] block">
                {t("program.splitMusclesHint")}
              </AppText>
              {splitMuscles.map((sel, si) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 분할 칸은 순서가 곧 신원이다
                <div key={si} className="mb-[var(--spacing-md)]">
                  <AppText variant="label" color="textMuted" className="block">
                    {t("program.splitLabel", { n: si + 1 })}
                  </AppText>
                  <div className="mt-[var(--spacing-xs)] flex flex-wrap gap-[var(--spacing-xs)]">
                    {SPLIT_MUSCLES.map((m) => (
                      <Chip
                        key={m}
                        label={muscleLabel(m, "ko")}
                        active={sel.includes(m)}
                        onPress={() =>
                          setSplitMuscles((prev) =>
                            prev.map((arr, i) =>
                              i !== si ? arr : arr.includes(m) ? arr.filter((x) => x !== m) : [...arr, m],
                            ),
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mb-[var(--spacing-xs)]">
          <AppText variant="label" color="textMuted">
            {t("program.equipment")}
          </AppText>
        </div>
        <div className="mb-[var(--spacing-lg)] flex flex-wrap gap-[var(--spacing-xs)]">
          {ALL_EQUIPMENT.map((eq) => (
            <Chip
              key={eq}
              label={equipmentLabel(eq, "ko")}
              active={equipment.includes(eq)}
              onPress={() =>
                setEquipment((prev) => (prev.includes(eq) ? prev.filter((e) => e !== eq) : [...prev, eq]))
              }
            />
          ))}
        </div>

        <Button
          title={t("program.generate")}
          icon="flash"
          loading={generating}
          onPress={generate}
          testId="program-generate"
        />

        {days ? (
          <div className="mt-[var(--spacing-lg)]" data-testid="program-preview">
            <AppText variant="heading" className="block">
              {programName}
            </AppText>
            {days.map((d, di) => (
              <Card
                key={`${d.templateKey}-${d.index}`}
                className="mt-[var(--spacing-md)]"
                data-testid="program-day"
              >
                <AppText variant="body" className="block font-medium!">
                  {dayName(d)}
                </AppText>
                <Divider />
                {d.slots.length === 0 ? (
                  <AppText variant="caption" color="textFaint">
                    {t("program.emptyDay")}
                  </AppText>
                ) : (
                  d.slots.map((s, si) => (
                    <div
                      key={s.ring[s.idx]}
                      className="flex items-center gap-[var(--spacing-sm)] py-[var(--spacing-xs)]"
                    >
                      <span className="min-w-0 flex-1">
                        <ExerciseName exerciseId={s.ring[s.idx]} variant="body" />
                        <AppText variant="caption" color="textMuted" className="block">
                          {`${s.targetSets} × ${s.targetRepsMin}-${s.targetRepsMax} · ${s.restSeconds}s`}
                        </AppText>
                      </span>
                      {/* 후보가 둘 이상일 때만 교체가 뜻이 있다. */}
                      {s.ring.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => swapSlot(di, si)}
                          aria-label={t("routines.swap")}
                          data-testid="program-swap"
                        >
                          <Icon name="swap-horizontal-outline" size={18} color="var(--color-brand)" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeSlot(di, si)}
                        aria-label={t("common.delete")}
                        data-testid="program-remove"
                      >
                        <Icon name="close" size={18} color="var(--color-ink3)" />
                      </button>
                    </div>
                  ))
                )}
              </Card>
            ))}

            <div className="mt-[var(--spacing-lg)] mb-[var(--spacing-xl)]">
              <Button title={t("program.adopt")} loading={adopting} onPress={adopt} testId="program-adopt" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChipSelect<T extends string | number>({
  label,
  options,
  value,
  onChange,
  testId,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  testId?: string;
}) {
  return (
    <div className="mb-[var(--spacing-lg)]" data-testid={testId}>
      <AppText variant="label" color="textMuted" className="mb-[var(--spacing-xs)] block">
        {label}
      </AppText>
      <div className="flex flex-wrap gap-[var(--spacing-xs)]">
        {options.map((o) => (
          <Chip
            key={String(o.value)}
            label={o.label}
            active={o.value === value}
            onPress={() => onChange(o.value)}
          />
        ))}
      </div>
    </div>
  );
}
