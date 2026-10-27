"use client";
// @plm SRS-077  프로필 체중 칸 — 최신값 읽기 전용 + 「기록」(WeighInSheet 재사용 · 명시적 저장) + 「체중 기록 전체」(고치기·지우기)(U-9)
//
// 예전 칸은 NumberStepper 의 onChange 마다 저장해 + 한 번에 이력 한 줄씩 쌓였다(U-9). 그 경로는 ProfileClient 에 주석으로 남겼다.
//   · 「기록」 = 측정 한 줄 추가(source='manual'). 값은 「내 체중」(미러 = resolveBodyweightKg 의 캐시)을 따른다.
//   · 마지막 기록을 지우면 체중이 미설정으로 돌아간다 — 지우기 전에 그 사실을 확인받는다(U-9 · 저장소가 미러를 null 로).
//   · 「체중 미설정으로 두기」 — 예전 스테퍼의 0(설정 안 함)을 잇는 길. 이력은 지우지 않고 core 표식 한 줄(무게 0)을 남긴다(CD-2):
//     updateUserSettings({ bodyweightKg: null }) → 같은 write 안에서 표식 + 미러 null. 다음 기록이 오면 다시 그 값이 내 체중이다.
// 표시 단위: 예전 프로필 단위가 lb 면 lb(core bodyweightUnitOf) — 저장은 늘 kg.
import {
  isValidBodyweightLog,
  sortBodyweightLogs,
  type ValidBodyweightLog,
} from "@app/core/domain/bodyweight";
import { bodyweightUnitOf, formatBodyweight, localDayRange } from "@app/core/domain/weighIn";
import { useUser } from "@app/core/state/userContext";
import { useState } from "react";
import { afterBodyweightWrite, useBodyweightLogs } from "@/lib/bodyweightLogs";
import { t } from "@/lib/i18n";
import { useToast } from "../Toast";
import { ConfirmDialog, SheetShell } from "../ui/Dialog";
import { ListRow } from "../ui/rows";
import { WeighInSheet, formatBodyweightDate, lastEntryOf } from "../session/WeighInSheet";

/** 「기록」 시트 — 프로필·통계가 같이 쓴다(source='manual'). */
export function BodyweightRecordSheet({ onClose }: { onClose: () => void }) {
  const { user, bodyweightKg, refresh } = useUser();
  const { logs } = useBodyweightLogs();
  const toast = useToast();
  const unit = bodyweightUnitOf(user?.weightUnit);
  const last = lastEntryOf(logs);
  return (
    <WeighInSheet
      testId="bodyweight-record-sheet"
      title={t("bodyweight.sheetRecordTitle")}
      unit={unit}
      initialKg={bodyweightKg ?? last?.kg ?? null}
      last={last}
      primaryLabel={t("bodyweight.save")}
      secondaryLabel={t("common.cancel")}
      onDismiss={onClose}
      onSave={async (kg) => {
        try {
          const repo = await import("@app/core/data/bodyweightRepository");
          await repo.addBodyweightLog({ weight: kg, unit: "kg", source: "manual" });
          await afterBodyweightWrite(refresh);
          toast(t("bodyweight.saved"));
          onClose();
        } catch (e) {
          toast(e instanceof Error ? e.message : t("bodyweight.saveFailed"), "error");
          throw e;
        }
      }}
    />
  );
}

/** 프로필 「설정」 묶음 안의 두 줄 — 체중(값 + 기록) · 체중 기록 전체 */
export function BodyweightRow() {
  const { user, bodyweightKg } = useUser();
  const { logs } = useBodyweightLogs();
  const [sheet, setSheet] = useState<null | "record" | "history">(null);
  const unit = bodyweightUnitOf(user?.weightUnit);
  const count = logs.filter(isValidBodyweightLog).length;
  return (
    <>
      <ListRow
        testId="bodyweight"
        title={t("profile.bodyweight")}
        subtitle={t("bodyweight.profileCaption")}
        wrapSubtitle
        trailing={
          <span className="flex shrink-0 items-center gap-[var(--spacing-sm)]">
            <span
              data-testid="bodyweight-value"
              className={`tabular-nums text-[length:var(--text-md)] ${
                bodyweightKg != null ? "font-semibold text-(--color-ink)" : "text-(--color-ink2)"
              }`}
            >
              {bodyweightKg != null
                ? `${formatBodyweight(bodyweightKg, unit)}${unit}`
                : t("bodyweight.unset")}
            </span>
            <button
              type="button"
              data-testid="btn-bodyweight-record"
              aria-label={t("bodyweight.recordAria")}
              onClick={() => setSheet("record")}
              className="flex h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-pill)] border border-(--color-line-strong) px-[var(--spacing-md)] font-medium text-(--color-ink) text-[length:var(--text-sm)] active:bg-(--color-surface-alt)"
            >
              {t("bodyweight.record")}
            </button>
          </span>
        }
      />
      <ListRow
        testId="row-bodyweight-history"
        title={t("bodyweight.historyEntry")}
        value={count > 0 ? t("bodyweight.historyCount", { count }) : undefined}
        onPress={() => setSheet("history")}
      />
      {sheet === "record" ? <BodyweightRecordSheet onClose={() => setSheet(null)} /> : null}
      {sheet === "history" ? <BodyweightHistorySheet onClose={() => setSheet(null)} /> : null}
    </>
  );
}

/** 같은 시각(시·분·초)을 유지한 채 날짜만 바꾼다 — 고치기의 날짜 칸 */
function withDate(measuredAt: number, ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const d = new Date(measuredAt);
  d.setFullYear(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

function ymdOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 「체중 기록 전체」 — 최근 것이 위. 고치기(값·날짜) · 지우기(마지막이면 「미설정으로 돌아가요」 확인) · 미설정으로 두기 */
export function BodyweightHistorySheet({ onClose }: { onClose: () => void }) {
  const { user, bodyweightKg, refresh } = useUser();
  const userId = user?.id ?? null;
  const { logs, loaded } = useBodyweightLogs();
  const toast = useToast();
  const unit = bodyweightUnitOf(user?.weightUnit);
  // 유효 행만(「설정 안 함」 표식은 측정이 아니라 목록에 안 보인다 · qa1 CD-2 주의)
  const rows = sortBodyweightLogs(logs).reverse();
  const [editing, setEditing] = useState<ValidBodyweightLog | null>(null);
  const [editDate, setEditDate] = useState("");
  const [deleting, setDeleting] = useState<ValidBodyweightLog | null>(null);
  const [confirmUnset, setConfirmUnset] = useState(false);
  const todayEnd = localDayRange(Date.now()).endMs;

  const run = async (fn: () => Promise<void>, done: string) => {
    try {
      await fn();
      await afterBodyweightWrite(refresh);
      toast(done);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("bodyweight.saveFailed"), "error");
      throw e;
    }
  };

  // 고치기·지우기 시트가 떠 있는 동안 목록 시트는 내린다(시트 두 겹 · 스크림 두 겹을 피한다)
  if (editing)
    return (
      <WeighInSheet
        testId="bodyweight-edit-sheet"
        title={t("bodyweight.sheetEditTitle")}
        unit={unit}
        initialKg={editing.weightKg}
        primaryLabel={t("bodyweight.save")}
        secondaryLabel={t("common.cancel")}
        onDismiss={() => setEditing(null)}
        extra={
          <label className="flex items-center justify-between gap-[var(--spacing-sm)] text-(--color-ink2) text-[length:var(--text-sm)]">
            {t("bodyweight.dateLabel")}
            <input
              type="date"
              data-testid="bodyweight-edit-date"
              value={editDate}
              max={ymdOf(todayEnd - 1)}
              onChange={(e) => setEditDate(e.target.value)}
              className="h-[44px] rounded-[var(--radius-md)] border border-(--color-line-strong) bg-(--color-surface) px-[var(--spacing-sm)] text-(--color-ink)"
            />
          </label>
        }
        onSave={async (kg) => {
          const e = editing;
          const measuredAt = withDate(e.measuredAt, editDate) ?? e.measuredAt;
          const changedKg = kg !== e.weightKg;
          const changedAt = measuredAt !== e.measuredAt;
          if (changedKg || changedAt)
            await run(async () => {
              const repo = await import("@app/core/data/bodyweightRepository");
              await repo.updateBodyweightLog(e.id, {
                ...(changedKg ? { weight: kg, unit: "kg" as const } : {}),
                ...(changedAt ? { measuredAt } : {}),
              });
            }, t("bodyweight.saved"));
          setEditing(null);
        }}
      />
    );

  return (
    <>
      <SheetShell
        title={t("bodyweight.historyTitle")}
        onClose={onClose}
        hideOk
        testId="bodyweight-history-sheet"
      >
        {loaded && rows.length === 0 ? (
          <p
            className="mt-[var(--spacing-sm)] text-(--color-ink2) text-[length:var(--text-sm)]"
            data-testid="bodyweight-history-empty"
          >
            {t("bodyweight.historyEmpty")}
          </p>
        ) : (
          <ul className="mt-[var(--spacing-sm)] flex flex-col" data-testid="bodyweight-history-list">
            {rows.map((l, i) => (
              <li
                key={l.id}
                data-testid="bodyweight-history-row"
                style={{ borderTopWidth: i === 0 ? 0 : 1, borderColor: "var(--color-line)" }}
                className="flex items-center gap-[var(--spacing-sm)] py-[4px]"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className="font-semibold text-(--color-ink) text-[length:var(--text-md)] tabular-nums"
                    data-testid="bodyweight-history-value"
                  >
                    {formatBodyweight(l.weightKg, unit)}
                    {unit}
                  </span>
                  <span className="truncate text-(--color-ink2) text-[length:var(--text-sm)]">
                    {formatBodyweightDate(l.measuredAt, true)}
                    {l.source === "checkin"
                      ? ` · ${t("bodyweight.sourceCheckin")}`
                      : l.source === "legacy"
                        ? ` · ${t("bodyweight.sourceLegacy")}`
                        : ""}
                  </span>
                </span>
                <button
                  type="button"
                  data-testid="bodyweight-history-edit"
                  onClick={() => {
                    setEditDate(ymdOf(l.measuredAt));
                    setEditing(l);
                  }}
                  className="flex h-[44px] min-w-[44px] items-center justify-center px-[var(--spacing-sm)] text-(--color-ink) text-[length:var(--text-sm)] underline underline-offset-2"
                >
                  {t("bodyweight.edit")}
                </button>
                <button
                  type="button"
                  data-testid="bodyweight-history-delete"
                  onClick={() => setDeleting(l)}
                  className="flex h-[44px] min-w-[44px] items-center justify-center px-[var(--spacing-sm)] text-(--color-bad) text-[length:var(--text-sm)] underline underline-offset-2"
                >
                  {t("bodyweight.delete")}
                </button>
              </li>
            ))}
          </ul>
        )}
        {rows.length > 0 && bodyweightKg != null && userId ? (
          <div className="mt-[var(--spacing-md)] border-(--color-line) border-t pt-[var(--spacing-sm)]">
            <button
              type="button"
              data-testid="btn-bodyweight-unset"
              onClick={() => setConfirmUnset(true)}
              className="flex min-h-[44px] w-full items-center text-left font-medium text-(--color-ink) text-[length:var(--text-sm)]"
            >
              {t("bodyweight.unsetAction")}
            </button>
            <p className="text-(--color-ink2) text-[length:var(--text-sm)]">{t("bodyweight.unsetCaption")}</p>
          </div>
        ) : null}
        <div className="mt-[var(--spacing-md)]">
          <button
            type="button"
            data-testid="bodyweight-history-close"
            onClick={onClose}
            className="h-[44px] w-full rounded-[var(--radius-md)] border border-(--color-line-strong) font-semibold text-(--color-ink) text-[length:var(--text-md)]"
          >
            {t("common.ok")}
          </button>
        </div>
      </SheetShell>

      {deleting ? (
        <ConfirmDialog
          testId="bodyweight-delete-confirm"
          title={rows.length <= 1 ? t("bodyweight.deleteLastTitle") : t("bodyweight.deleteTitle")}
          message={
            rows.length <= 1
              ? t("bodyweight.deleteLastConfirm")
              : `${formatBodyweight(deleting.weightKg, unit)}${unit} · ${formatBodyweightDate(deleting.measuredAt, true)}`
          }
          confirmLabel={t("bodyweight.delete")}
          destructive
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const d = deleting;
            setDeleting(null);
            void run(async () => {
              const repo = await import("@app/core/data/bodyweightRepository");
              await repo.deleteBodyweightLog(d.id);
            }, t("bodyweight.deleted")).catch(() => {});
          }}
        />
      ) : null}
      {confirmUnset && userId ? (
        <ConfirmDialog
          testId="bodyweight-unset-confirm"
          title={t("bodyweight.unsetAction")}
          message={t("bodyweight.unsetCaption")}
          confirmLabel={t("bodyweight.unsetAction")}
          onCancel={() => setConfirmUnset(false)}
          onConfirm={() => {
            setConfirmUnset(false);
            void run(async () => {
              const userRepo = await import("@app/core/data/userRepository");
              await userRepo.updateUserSettings(userId, { bodyweightKg: null });
            }, t("bodyweight.unsetDone")).catch(() => {});
          }}
        />
      ) : null}
    </>
  );
}
