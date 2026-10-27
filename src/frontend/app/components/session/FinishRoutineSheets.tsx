"use client";
// @plm SRS-059 SRS-060  운동 완료 직후 — 루틴과 달라진 점을 남길지 · 운동을 루틴으로 저장할지
//
// 운동은 이미 완료·저장된 뒤에 뜬다(요약 화면 위). 닫으면 「오늘만 / 저장 안 함」과 같다 — 잃는 것이 없다.
//
//   루틴 운동(달라진 점 있음)   바뀐 대로 루틴 바꾸기 → 항목 체크 → 반영 · 새 루틴으로 저장 → 이름 · 오늘만
//   빠른 운동                  루틴으로 저장할까요? → 이름 → 저장 / 저장 안 함
//   요약·기록 상세의 버튼        이름 → 저장
//
// 무엇이 바뀌었는지·무엇을 반영하는지는 전부 core(domain/routineDiff · data/finishRoutine)가 정한다.
import type { FinishPlan, RoutineChange, SessionBlock } from "@app/core/domain/routineDiff";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useExerciseName } from "@/lib/exerciseNames";
import { useToast } from "../Toast";
import { Button } from "../ui/Button";
import { SheetShell } from "../ui/Dialog";
import { TextField } from "../ui/inputs";
import { AppText } from "../ui/primitives";

export interface FinishPromptState {
  kind: "routine" | "quick";
  workoutId: string;
  routineName: string | null;
  plan: FinishPlan | null;
  /** 완료 직전 스냅샷 — 완료가 지운 블록이 있어도 같은 내용으로 저장한다. */
  blocks: SessionBlock[];
}

type Step = "choose" | "pick" | "name";

export function FinishRoutineSheets({ prompt, onDone }: { prompt: FinishPromptState; onDone: () => void }) {
  const [step, setStep] = useState<Step>(prompt.kind === "routine" ? "choose" : "name");
  if (step === "pick" && prompt.plan)
    return <PickChanges plan={prompt.plan} onBack={() => setStep("choose")} onDone={onDone} />;
  if (step === "name")
    return (
      <NameRoutine
        workoutId={prompt.workoutId}
        snapshot={prompt.blocks}
        quick={prompt.kind === "quick"}
        onCancel={prompt.kind === "routine" ? () => setStep("choose") : onDone}
        onDone={onDone}
      />
    );

  const plan = prompt.plan as FinishPlan;
  return (
    <SheetShell
      testId="finish-routine"
      title={t("finish.routineTitle", { routine: prompt.routineName ?? "" })}
      onClose={onDone}
      hideOk
    >
      <AppText variant="body" color="textMuted" className="mt-[var(--spacing-xs)] block">
        {t("finish.routineMessage")}
      </AppText>
      <div className="mt-[var(--spacing-md)] flex flex-col gap-[var(--spacing-sm)]">
        <Button
          title={t("finish.applyToRoutine")}
          testId="btn-finish-apply"
          disabled={!plan.canApply}
          onPress={() => setStep("pick")}
        />
        {!plan.canApply ? (
          <AppText variant="caption" color="textMuted" className="block" data-testid="finish-locked">
            {t("finish.prescriptionLocked")}
          </AppText>
        ) : null}
        <Button
          title={t("finish.saveAsNew")}
          variant="secondary"
          testId="btn-finish-save-new"
          onPress={() => setStep("name")}
        />
        <Button
          title={t("finish.todayOnly")}
          variant="secondary"
          testId="btn-finish-today"
          onPress={onDone}
        />
      </div>
    </SheetShell>
  );
}

/** 바뀐 항목 체크 목록 — 기본은 core 가 정한 대로(운동 중 지운 줄·교체·세트 수·추가는 켜짐, 건너뛴 종목 빼기는 꺼짐). */
function PickChanges({ plan, onBack, onDone }: { plan: FinishPlan; onBack: () => void; onDone: () => void }) {
  const toast = useToast();
  const [sel, setSel] = useState<Set<string>>(
    () => new Set(plan.changes.filter((c) => c.defaultOn).map((c) => c.id)),
  );
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <SheetShell testId="finish-pick" title={t("finish.pickTitle")} onClose={onBack} hideOk>
      <AppText variant="caption" color="textMuted" className="mt-[var(--spacing-xs)] block">
        {t("finish.pickMessage")}
      </AppText>
      <ul
        className="mt-[var(--spacing-md)] flex flex-col gap-[var(--spacing-xs)]"
        data-testid="finish-changes"
      >
        {plan.changes.map((c) => (
          <li key={c.id}>
            <label
              data-testid={`finish-change-${c.kind}`}
              className="flex cursor-pointer items-center gap-[var(--spacing-sm)] rounded-[var(--radius-md)] bg-(--color-surface-alt) p-[var(--spacing-md)]"
            >
              <input
                type="checkbox"
                data-testid={`finish-check-${c.id}`}
                checked={sel.has(c.id)}
                onChange={() => toggle(c.id)}
                className="h-4 w-4 accent-(--color-brand)"
              />
              <AppText variant="body" className="min-w-0 flex-1">
                <ChangeLabel change={c} />
              </AppText>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-[var(--spacing-md)] flex gap-[var(--spacing-sm)]">
        <Button title={t("common.cancel")} variant="secondary" onPress={onBack} />
        <Button
          title={t("finish.apply")}
          testId="btn-finish-apply-confirm"
          loading={busy}
          disabled={sel.size === 0}
          onPress={() => {
            setBusy(true);
            void (async () => {
              try {
                const fr = await import("@app/core/data/finishRoutine");
                await fr.applyRoutineChanges(plan, [...sel]);
                const { flushLocalDb } = await import("@/lib/localDb");
                await flushLocalDb();
                toast(t("finish.applied"));
                onDone();
              } catch (e) {
                toast(e instanceof Error ? e.message : String(e), "error");
                setBusy(false);
              }
            })();
          }}
        />
      </div>
    </SheetShell>
  );
}

function ChangeLabel({ change }: { change: RoutineChange }) {
  const a = useExerciseName(
    change.kind === "swap"
      ? change.from
      : change.kind === "order" || change.kind === "superset"
        ? null
        : change.exerciseId,
  );
  const b = useExerciseName(change.kind === "swap" ? change.to : null);
  switch (change.kind) {
    case "swap":
      return <>{t("finish.change.swap", { from: a ?? "", to: b ?? "" })}</>;
    case "sets":
      return <>{t("finish.change.sets", { name: a ?? "", from: change.from, to: change.to })}</>;
    case "add":
      return <>{t("finish.change.add", { name: a ?? "" })}</>;
    case "remove":
      return (
        <>
          {t(change.reason === "skipped" ? "finish.change.removeSkipped" : "finish.change.remove", {
            name: a ?? "",
          })}
        </>
      );
    case "order":
      return <>{t("finish.change.order")}</>;
    case "superset":
      return <>{t("finish.change.superset")}</>;
  }
}

/** 이름 정하고 새 루틴으로 저장 — 빠른 운동 질문·「새 루틴으로 저장」·「이 운동으로 루틴 만들기」 공용. */
export function NameRoutine({
  workoutId,
  snapshot,
  quick = false,
  onCancel,
  onDone,
}: {
  workoutId: string;
  snapshot?: SessionBlock[];
  quick?: boolean;
  onCancel: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const fr = await import("@app/core/data/finishRoutine");
      const n = await fr.suggestNameForWorkout(workoutId).catch(() => "");
      if (alive) setName((cur) => cur || n);
    })();
    return () => {
      alive = false;
    };
  }, [workoutId]);
  return (
    <SheetShell
      testId="finish-name"
      title={quick ? t("finish.quickTitle") : t("finish.saveAsNew")}
      onClose={onCancel}
      hideOk
    >
      {quick ? (
        <AppText variant="caption" color="textMuted" className="mt-[var(--spacing-xs)] block">
          {t("finish.quickMessage")}
        </AppText>
      ) : null}
      <div className="mt-[var(--spacing-md)]">
        <TextField
          label={t("finish.nameLabel")}
          testId="finish-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="flex gap-[var(--spacing-sm)]">
        <Button
          title={quick ? t("finish.dontSave") : t("common.cancel")}
          variant="secondary"
          testId="btn-finish-dont-save"
          onPress={onCancel}
        />
        <Button
          title={t("finish.save")}
          testId="btn-finish-save"
          loading={busy}
          disabled={!name.trim()}
          onPress={() => {
            setBusy(true);
            void (async () => {
              try {
                const fr = await import("@app/core/data/finishRoutine");
                const r = await fr.saveWorkoutAsRoutine(workoutId, name, snapshot);
                const { flushLocalDb } = await import("@/lib/localDb");
                await flushLocalDb();
                if (r) toast(t("finish.saved", { name: (r as unknown as { name: string }).name }));
                onDone();
              } catch (e) {
                toast(e instanceof Error ? e.message : String(e), "error");
                setBusy(false);
              }
            })();
          }}
        />
      </div>
    </SheetShell>
  );
}
