"use client";
// 그룹 챌린지 만들기·고치기 시트(SPEC-064 Phase 2 · SRS-118).
//
// 고치기는 모집 중 방장만(서버가 다시 막는다). 시작일은 내일부터 30일 안(서버 Draft.Validate 와 같다).
// 돈은 다루지 않는다 — 벌칙은 그룹이 정한 글을 기록만 한다(ADR-065).
import type { Rule } from "@app/contracts";
import { useState } from "react";
import { addDays, challengeDay, weekdayName } from "@/lib/challengeClient";
import { errorText } from "@/lib/errorText";
import { t } from "@/lib/i18n";
import { useToast } from "../Toast";
import { Button } from "../ui/Button";
import { SheetShell } from "../ui/Dialog";
import { NumberStepper, TextField } from "../ui/inputs";
import { AppText } from "../ui/primitives";
import { Segmented } from "../ui/rows";

export interface RuleDraft {
  title: string;
  startsOn: string;
  weeks: number;
  ruleKind: "daily" | "weekdays";
  weekdays: number;
  minSets: number;
  proofMode: "gym" | "any_photo" | "record";
  penaltyText: string;
  passPerWeek: number;
}

export function defaultDraft(): RuleDraft {
  return {
    title: "",
    startsOn: addDays(challengeDay(), 1),
    weeks: 4,
    ruleKind: "daily",
    weekdays: 127,
    minSets: 5,
    proofMode: "gym",
    penaltyText: "",
    passPerWeek: 1,
  };
}

export function draftFromRule(r: Rule): RuleDraft {
  return {
    title: r.title,
    startsOn: r.startsOn,
    weeks: r.weeks,
    ruleKind: r.ruleKind === "weekdays" ? "weekdays" : "daily",
    weekdays: r.weekdays,
    minSets: r.minSets,
    proofMode: r.proofMode === "any_photo" || r.proofMode === "record" ? r.proofMode : "gym",
    penaltyText: r.penaltyText,
    passPerWeek: r.passPerWeek,
  };
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-[var(--spacing-md)] flex flex-col gap-[var(--spacing-xs)]">
      <AppText variant="label" color="textMuted">
        {label}
      </AppText>
      {children}
      {hint ? (
        <AppText variant="caption" color="textFaint">
          {hint}
        </AppText>
      ) : null}
    </div>
  );
}

export function ChallengeForm({
  initial,
  onClose,
  onSubmit,
  editing,
}: {
  initial: RuleDraft;
  onClose: () => void;
  /** 서버에 보낸다 — 실패하면 던진다(시트는 열어 둔다) */
  onSubmit: (d: RuleDraft) => Promise<void>;
  editing?: boolean;
}) {
  const toast = useToast();
  const [d, setD] = useState<RuleDraft>(initial);
  const [busy, setBusy] = useState(false);
  const today = challengeDay();
  const set = <K extends keyof RuleDraft>(k: K, v: RuleDraft[K]) => setD((p) => ({ ...p, [k]: v }));

  const titleOk = d.title.trim().length >= 1 && d.title.trim().length <= 30;
  const dateOk = d.startsOn >= addDays(today, 1) && d.startsOn <= addDays(today, 30);
  const daysOk = d.ruleKind === "daily" || d.weekdays > 0;
  const ok = titleOk && dateOk && daysOk && !busy;

  async function submit() {
    if (!ok) return;
    setBusy(true);
    try {
      await onSubmit({ ...d, title: d.title.trim(), penaltyText: d.penaltyText.trim() });
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SheetShell
      title={editing ? t("challenge.form.editTitle") : t("challenge.form.newTitle")}
      onClose={onClose}
      hideOk
      testId="challenge-form"
    >
      <div className="mt-[var(--spacing-md)] max-h-[70vh] overflow-y-auto pr-[2px]">
        <TextField
          label={t("challenge.form.name")}
          placeholder={t("challenge.form.namePlaceholder")}
          value={d.title}
          maxLength={30}
          onChange={(e) => set("title", e.target.value)}
          testId="challenge-form-title"
        />
        <Field label={t("challenge.form.startsOn")} hint={t("challenge.form.startsOnHint")}>
          <input
            type="date"
            value={d.startsOn}
            min={addDays(today, 1)}
            max={addDays(today, 30)}
            onChange={(e) => set("startsOn", e.target.value)}
            data-testid="challenge-form-starts"
            className="w-full rounded-[var(--radius-sm)] border border-(--color-line-strong) bg-(--color-card) px-[var(--spacing-md)] py-[var(--spacing-md)] text-[length:var(--text-md)] text-(--color-ink)"
          />
        </Field>
        <Field label={t("challenge.form.weeks")}>
          <NumberStepper
            value={d.weeks}
            min={1}
            max={8}
            onChange={(n) => set("weeks", n)}
            suffix={t("challenge.form.weeksSuffix")}
            testId="challenge-form-weeks"
          />
        </Field>
        <Field label={t("challenge.form.schedule")}>
          <Segmented
            items={[
              { value: "daily", label: t("challenge.rule.daily"), testId: "challenge-form-daily" },
              { value: "weekdays", label: t("challenge.form.pickDays"), testId: "challenge-form-weekdays" },
            ]}
            value={d.ruleKind}
            onChange={(v) => setD((p) => ({ ...p, ruleKind: v, weekdays: v === "daily" ? 127 : p.weekdays }))}
          />
          {d.ruleKind === "weekdays" ? (
            <div className="flex gap-[4px]" data-testid="challenge-form-days">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                const on = (d.weekdays & (1 << i)) !== 0;
                return (
                  <button
                    key={`day-${i}`}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("weekdays", d.weekdays ^ (1 << i))}
                    data-testid={`challenge-form-day-${i}`}
                    className={`flex h-11 flex-1 items-center justify-center rounded-[var(--radius-sm)] border text-[length:var(--text-sm)] ${
                      on
                        ? "border-(--color-brand) font-semibold text-(--color-brand)"
                        : "border-(--color-line-strong) text-(--color-ink2)"
                    }`}
                  >
                    {weekdayName(i)}
                  </button>
                );
              })}
            </div>
          ) : null}
        </Field>
        <Field label={t("challenge.form.minSets")} hint={t("challenge.form.minSetsHint")}>
          <NumberStepper
            value={d.minSets}
            min={1}
            max={30}
            onChange={(n) => set("minSets", n)}
            suffix={t("challenge.form.setsSuffix")}
            testId="challenge-form-minsets"
          />
        </Field>
        <Field label={t("challenge.form.proof")} hint={t(`challenge.form.proofHint.${d.proofMode}`)}>
          <Segmented
            items={[
              { value: "gym", label: t("challenge.mode.gym"), testId: "challenge-form-mode-gym" },
              { value: "any_photo", label: t("challenge.mode.any_photo"), testId: "challenge-form-mode-any" },
              { value: "record", label: t("challenge.mode.record"), testId: "challenge-form-mode-record" },
            ]}
            value={d.proofMode}
            onChange={(v) => set("proofMode", v)}
          />
        </Field>
        <TextField
          label={t("challenge.form.penalty")}
          placeholder={t("challenge.form.penaltyPlaceholder")}
          hint={t("challenge.form.penaltyHint")}
          value={d.penaltyText}
          maxLength={60}
          onChange={(e) => set("penaltyText", e.target.value)}
          testId="challenge-form-penalty"
        />
        <Field label={t("challenge.form.pass")} hint={t("challenge.form.passHint")}>
          <Segmented
            items={[
              { value: "1", label: t("challenge.form.passOne"), testId: "challenge-form-pass-1" },
              { value: "0", label: t("challenge.form.passNone"), testId: "challenge-form-pass-0" },
            ]}
            value={String(d.passPerWeek) as "0" | "1"}
            onChange={(v) => set("passPerWeek", Number(v))}
          />
        </Field>
        <AppText variant="caption" color="textMuted" className="mb-[var(--spacing-md)] block">
          {t("challenge.form.note")}
        </AppText>
      </div>
      <div className="mt-[var(--spacing-sm)] flex gap-[var(--spacing-sm)]">
        <div className="flex-1">
          <Button
            title={t("common.cancel")}
            variant="secondary"
            onPress={onClose}
            testId="challenge-form-cancel"
          />
        </div>
        <div className="flex-1">
          <Button
            title={editing ? t("challenge.form.save") : t("challenge.form.create")}
            onPress={() => void submit()}
            disabled={!ok}
            loading={busy}
            testId="challenge-form-submit"
          />
        </div>
      </div>
    </SheetShell>
  );
}
