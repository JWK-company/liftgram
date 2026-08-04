"use client";
// @plm SRS-044  주간 스케줄 편집 — app의 WorkoutTabScreen의 ScheduleEditModal을 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 요일마다 루틴을 배정하고, 몇 주 주기로 돌지(블록)를 정한다.
//
// ── 요일 선택을 목록으로 바꿨다 ─────────────────────────────────────────────
// app은 요일을 누르면 시스템 Alert에 루틴을 늘어놓는데, 그 Alert이 **최대 8개**만 담아
// 루틴이 많으면 뒤가 잘렸다(원본 주석에도 "필요 시 후속 개선"이라 적혀 있다).
// 웹에는 그 제약이 없으므로 스크롤되는 목록으로 둔다 — 잘리는 루틴이 없다.
//
// ── 저장은 두 값을 함께 본다 ────────────────────────────────────────────────
// 요일이 하나도 없고 블록도 없으면 **스케줄 자체를 지운다**(null). "빈 스케줄"을 남기면
// 오늘의 안내가 늘 비어 있는데 사용자는 스케줄이 있다고 생각한다.
//
// ── 블록 시작 시각 ──────────────────────────────────────────────────────────
// 주기를 **바꿀 때만** 지금부터 1주차로 다시 센다. 같은 주기를 유지하면 시작 시각을 보존한다 —
// 저장할 때마다 1주차로 돌아가면 디로딩 주차가 영영 오지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import type { ScheduleDay, WeeklySchedule } from "@app/core";
import { useState } from "react";
import { t, type TransKey } from "@/lib/i18n";
import { Button } from "../ui/Button";
import { ConfirmDialog, Overlay } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { AppText } from "../ui/primitives";

/** 월~일. 도메인의 배열 순서와 같아야 한다(0=월). */
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/** 블록 주기 선택지. `null`은 "주기 없음"(매주 같은 배정). */
const BLOCK_OPTIONS: (number | null)[] = [null, 3, 4, 5, 6];

interface RoutineLite {
  id: string;
  name: string;
}

export function ScheduleEditor({
  schedule,
  routines,
  onSave,
  onDelete,
  onClose,
}: {
  schedule: WeeklySchedule | null;
  routines: RoutineLite[];
  onSave: (next: WeeklySchedule | null) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [days, setDays] = useState<ScheduleDay[]>(() =>
    schedule?.days ? [...schedule.days] : Array.from({ length: 7 }, () => null),
  );
  const [blockWeeks, setBlockWeeks] = useState<number | null>(schedule?.blockWeeks ?? null);
  const [picking, setPicking] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const nameOf = (id: string) => routines.find((r) => r.id === id)?.name ?? null;

  function setDay(i: number, value: ScheduleDay) {
    setDays((d) => d.map((v, idx) => (idx === i ? value : v)));
    setPicking(null);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    const hasAny = days.some((d) => d !== null) || blockWeeks != null;
    const next: WeeklySchedule | null = hasAny
      ? {
          days,
          blockWeeks,
          // 주기를 바꿨을 때만 지금부터 1주차. 유지하면 보존한다.
          blockStartAt:
            blockWeeks == null
              ? null
              : schedule?.blockWeeks === blockWeeks
                ? (schedule?.blockStartAt ?? Date.now())
                : Date.now(),
        }
      : null;
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  }

  // 요일 하나를 고르는 중 — 루틴 목록·휴식·미배정.
  if (picking !== null) {
    const i = picking;
    return (
      <Overlay onClose={() => setPicking(null)} testId="schedule-day-picker">
        <AppText variant="heading" className="block">
          {t(`schedule.day.${DAY_KEYS[i]}` as TransKey)}
        </AppText>
        <AppText variant="caption" color="textMuted" className="mt-[2px] block">
          {t("schedule.pickPrompt")}
        </AppText>

        {/* app은 시스템 Alert의 한계로 8개만 보여 줬다 — 여기서는 전부 보여 준다. */}
        <div className="mt-[var(--spacing-md)] max-h-[46vh] overflow-y-auto">
          {routines.map((r) => (
            <PickRow key={r.id} label={r.name} testId="pick-routine" onPress={() => setDay(i, r.id)} />
          ))}
          <PickRow label={t("schedule.rest")} testId="pick-rest" onPress={() => setDay(i, "rest")} />
          <PickRow label={t("schedule.unassigned")} testId="pick-none" onPress={() => setDay(i, null)} />
        </div>

        <div className="mt-[var(--spacing-md)]">
          <Button title={t("common.cancel")} variant="secondary" onPress={() => setPicking(null)} />
        </div>
      </Overlay>
    );
  }

  if (confirmDelete) {
    return (
      <ConfirmDialog
        testId="confirm-delete-schedule"
        title={t("schedule.deleteTitle")}
        message={t("schedule.deleteMessage")}
        confirmLabel={t("common.delete")}
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void onDelete()}
      />
    );
  }

  return (
    <Overlay onClose={onClose} testId="schedule-editor">
      <AppText variant="heading" className="block">
        {t("schedule.editTitle")}
      </AppText>

      <div className="mt-[var(--spacing-sm)]">
        {DAY_KEYS.map((k, i) => {
          const entry = days[i];
          const label =
            entry === "rest" ? t("schedule.rest") : entry ? (nameOf(entry) ?? "?") : t("schedule.unassigned");
          return (
            <button
              key={k}
              type="button"
              onClick={() => setPicking(i)}
              data-testid={`schedule-day-${k}`}
              className="flex w-full items-center gap-[var(--spacing-sm)] border-(--color-line) border-b py-[var(--spacing-sm)] text-left"
            >
              <AppText variant="body" className="w-[32px] shrink-0">
                {t(`schedule.dayShort.${k}` as TransKey)}
              </AppText>
              <AppText
                variant="body"
                color={entry ? "text" : "textFaint"}
                className="min-w-0 flex-1 truncate"
              >
                {label}
              </AppText>
              <Icon name="chevron-forward" size={16} color="var(--color-ink2)" />
            </button>
          );
        })}
      </div>

      <AppText
        variant="label"
        color="textMuted"
        className="mt-[var(--spacing-md)] mb-[var(--spacing-xs)] block"
      >
        {t("schedule.blockLabel")}
      </AppText>
      <div className="flex flex-wrap gap-[var(--spacing-xs)]">
        {BLOCK_OPTIONS.map((w) => {
          const on = blockWeeks === w;
          return (
            <button
              key={String(w)}
              type="button"
              onClick={() => setBlockWeeks(w)}
              aria-pressed={on}
              data-testid={`schedule-block-${w ?? "none"}`}
              className={`rounded-[var(--radius-pill)] border px-[var(--spacing-md)] py-[var(--spacing-xs)] ${
                on
                  ? "border-(--color-brand) bg-(--color-brand-muted)"
                  : "border-(--color-line) bg-(--color-surface-alt)"
              }`}
            >
              <AppText variant="caption" color={on ? "primary" : "text"} className={on ? "font-bold!" : ""}>
                {w == null ? t("schedule.blockNone") : t("schedule.blockOption", { weeks: w })}
              </AppText>
            </button>
          );
        })}
      </div>
      <AppText variant="caption" color="textFaint" className="mt-[var(--spacing-xs)] block">
        {t("schedule.blockHint")}
      </AppText>

      <div className="mt-[var(--spacing-md)] flex gap-[var(--spacing-sm)]">
        <Button title={t("common.cancel")} variant="secondary" onPress={onClose} testId="schedule-cancel" />
        <Button
          title={t("common.save")}
          loading={saving}
          onPress={() => void save()}
          testId="schedule-save"
        />
      </div>

      {/* 기존 스케줄을 고치는 중일 때만 — 새로 만드는 중에는 지울 것이 없다. */}
      {schedule ? (
        <div className="mt-[var(--spacing-sm)]">
          <Button
            title={t("schedule.deleteButton")}
            variant="danger"
            icon="trash-outline"
            size="sm"
            onPress={() => setConfirmDelete(true)}
            testId="schedule-delete"
          />
        </div>
      ) : null}
    </Overlay>
  );
}

function PickRow({ label, onPress, testId }: { label: string; onPress: () => void; testId: string }) {
  return (
    <button
      type="button"
      onClick={onPress}
      data-testid={testId}
      className="flex w-full items-center border-(--color-line) border-b py-[var(--spacing-sm)] text-left"
    >
      <AppText variant="body" className="min-w-0 flex-1 truncate">
        {label}
      </AppText>
    </button>
  );
}
