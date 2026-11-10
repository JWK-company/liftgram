"use client";
// @plm SRS-077  프로필 체중 칸 — 최신값 읽기 전용 + 「기록」(WeighInSheet 재사용 · 명시적 저장) + 「체중 기록 전체」(고치기·지우기)(U-9)
//
// 예전 칸은 NumberStepper 의 onChange 마다 저장해 + 한 번에 이력 한 줄씩 쌓였다(U-9). 그 경로는 ProfileClient 에 주석으로 남겼다.
//   · 「기록」 = 측정 한 줄 추가(source='manual'). 값은 「내 체중」(미러 = resolveBodyweightKg 의 캐시)을 따른다.
//   · 마지막 기록을 지우면 체중이 미설정으로 돌아간다 — 지우기 전에 그 사실을 확인받는다(U-9 · 저장소가 미러를 null 로).
//   · 「체중 미설정으로 두기」 — 예전 스테퍼의 0(설정 안 함)을 잇는 길. 이력은 지우지 않고 core 표식 한 줄(무게 0)을 남긴다(CD-2):
//     updateUserSettings({ bodyweightKg: null }) → 같은 write 안에서 표식 + 미러 null. 다음 기록이 오면 다시 그 값이 내 체중이다.
//     이력이 0 이고 프로필 값만 있는 기기(로그인 안 한 기기는 bw-init 을 심지 않는다 · CD-5)에서도 보인다(qa P3-8).
// 표시 단위: kg 고정(SRS-067 · core bodyweightUnitOf) — 저장도 kg.
// [개선] 체중 한 줄(2026-11-10) — 두 줄(「체중」+「기록」 버튼 · 「체중 기록 전체 n개 ›」)을 「체중 ‹최근 값› ›」 한 줄로 합쳤다.
//   줄을 누르면 「체중」 시트 하나 — 맨 위 바로 입력(WeighInSheet inline · 저장해도 열린 채, 새 줄이 목록 맨 위에) → 지난 기록(고치기·지우기)
//   → 「체중 미설정으로 두기」(설명은 확인 창에만) → 확인. 줄·시트의 부가 설명 두 줄은 지웠다(확인 창과 겹침).
//   BodyweightRecordSheet(포탈 시트)는 통계 체중 카드가 그대로 쓴다.
// 고치기 날짜: 날짜만 바꾸고 시각은 두되 **지금보다 뒤면 지금으로 자른다**(미래 측정은 뒤에 적은 기록을 가린다 · qa P3-1 · core 도 거부).
import { errorText } from "@/lib/errorText";
import {
  // [원본] isValidBodyweightLog, — 「체중 기록 전체 n개」 줄과 함께 빠졌다(주석으로 남긴 옛 BodyweightRow 만 쓴다)
  sortBodyweightLogs,
  type ValidBodyweightLog,
} from "@app/core/domain/bodyweight";
import { bodyweightUnitOf, formatBodyweight, localDayRange } from "@app/core/domain/weighIn";
import { useUser } from "@app/core/state/userContext";
import { useEffect, useRef, useState } from "react";
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
      // 인바디 두 칸(SPEC-049 Phase 3) — 새 줄이라 빈 칸에서 시작
      inbody={{ skeletalMuscleKg: null, bodyFatPct: null }}
      onSave={async (kg, extras) => {
        try {
          const repo = await import("@app/core/data/bodyweightRepository");
          // [원본] await repo.addBodyweightLog({ weight: kg, unit: "kg", source: "manual" });
          await repo.addBodyweightLog({ weight: kg, unit: "kg", source: "manual", ...(extras ?? {}) });
          await afterBodyweightWrite(refresh);
          toast(t("bodyweight.saved"));
          onClose();
        } catch (e) {
          toast(errorText(e, t("bodyweight.saveFailed")), "error");
          throw e;
        }
      }}
    />
  );
}

/* [원본] 프로필 「설정」 묶음 안의 두 줄 — 체중(값 + 기록) · 체중 기록 전체
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
*/

/** [개선] 프로필 「설정」 묶음 안의 한 줄 — 「체중 ‹최근 값› ›」. 줄 전체가 누르는 자리(ListRow 52px) → 「체중」 시트 */
export function BodyweightRow() {
  const { user, bodyweightKg } = useUser();
  const [open, setOpen] = useState(false);
  const unit = bodyweightUnitOf(user?.weightUnit);
  return (
    <>
      <ListRow
        testId="bodyweight"
        title={t("profile.bodyweight")}
        value={
          <span
            data-testid="bodyweight-value"
            className={`tabular-nums text-[length:var(--text-md)] ${
              bodyweightKg != null ? "font-semibold text-(--color-ink)" : "text-(--color-ink2)"
            }`}
          >
            {bodyweightKg != null ? `${formatBodyweight(bodyweightKg, unit)}${unit}` : t("bodyweight.unset")}
          </span>
        }
        onPress={() => setOpen(true)}
      />
      {open ? <BodyweightHistorySheet onClose={() => setOpen(false)} /> : null}
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

/**
 * 「체중」 시트 — 맨 위 바로 입력(새 줄 · source='manual') · 지난 기록(최근 것이 위 · 고치기(값·날짜) · 지우기(마지막이면 「미설정으로 돌아가요」 확인))
 * · 미설정으로 두기. [원본] 제목 「체중 기록 전체」 · 바로 입력 없음(「기록」 버튼의 따로 시트)
 */
export function BodyweightHistorySheet({ onClose }: { onClose: () => void }) {
  const { user, bodyweightKg, refresh } = useUser();
  const userId = user?.id ?? null;
  const { logs, loaded } = useBodyweightLogs();
  const toast = useToast();
  const unit = bodyweightUnitOf(user?.weightUnit);
  // 유효 행만(「설정 안 함」 표식은 측정이 아니라 목록에 안 보인다 · qa1 CD-2 주의)
  const rows = sortBodyweightLogs(logs).reverse();
  const last = lastEntryOf(logs); // [개선] 바로 입력의 출발값·±30% 기준
  const [editing, setEditing] = useState<ValidBodyweightLog | null>(null);
  const [editDate, setEditDate] = useState("");
  const [deleting, setDeleting] = useState<ValidBodyweightLog | null>(null);
  const [confirmUnset, setConfirmUnset] = useState(false);
  const todayEnd = localDayRange(Date.now()).endMs;

  // [개선] 바로 입력 중 바깥(스크림) 누름 = 입력 확정만(닫지 않음 · qa P3-7 을 inline 에서도 · 리뷰 M-1).
  //   누르기 시작하는 순간(capture pointerdown — 입력칸 blur 보다 먼저) 입력 중이었는지 적어 두고, Overlay 의 닫기에서 한 번 거른다.
  //   Esc·뒤로·「확인」은 그대로 닫는다(누름 표식은 마지막 누름 때의 값이라 키보드 닫기엔 걸리지 않는다).
  const typingRef = useRef(false);
  const downWhileTyping = useRef(false);
  useEffect(() => {
    const onDown = () => {
      downWhileTyping.current = typingRef.current;
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, []);
  const closeFromOverlay = () => {
    if (downWhileTyping.current) {
      downWhileTyping.current = false;
      return;
    }
    onClose();
  };

  const run = async (fn: () => Promise<void>, done: string) => {
    try {
      await fn();
      await afterBodyweightWrite(refresh);
      toast(done);
    } catch (e) {
      toast(errorText(e, t("bodyweight.saveFailed")), "error");
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
        compareKg={editing.weightKg}
        inbody={{
          skeletalMuscleKg: editing.skeletalMuscleKg ?? null,
          bodyFatPct: editing.bodyFatPct ?? null,
        }}
        onSave={async (kg, extras) => {
          const e = editing;
          // [원본] const measuredAt = withDate(e.measuredAt, editDate) ?? e.measuredAt;
          // [개선] 오늘로 옮기면서 시각이 지금보다 뒤면 지금으로(qa P3-1)
          const picked = withDate(e.measuredAt, editDate) ?? e.measuredAt;
          const measuredAt = picked === e.measuredAt ? picked : Math.min(picked, Date.now());
          const changedKg = kg !== e.weightKg;
          const changedAt = measuredAt !== e.measuredAt;
          // 인바디 — 펼쳐 저장했고 값이 달라졌을 때만(SPEC-049 Phase 3)
          const changedSmm = extras != null && extras.skeletalMuscleKg !== (e.skeletalMuscleKg ?? null);
          const changedPbf = extras != null && extras.bodyFatPct !== (e.bodyFatPct ?? null);
          // [원본] if (changedKg || changedAt)
          if (changedKg || changedAt || changedSmm || changedPbf)
            await run(async () => {
              const repo = await import("@app/core/data/bodyweightRepository");
              await repo.updateBodyweightLog(e.id, {
                ...(changedKg ? { weight: kg, unit: "kg" as const } : {}),
                ...(changedAt ? { measuredAt } : {}),
                ...(changedSmm ? { skeletalMuscleKg: extras?.skeletalMuscleKg ?? null } : {}),
                ...(changedPbf ? { bodyFatPct: extras?.bodyFatPct ?? null } : {}),
              });
            }, t("bodyweight.saved"));
          setEditing(null);
        }}
      />
    );

  return (
    <>
      {/* [원본] <SheetShell title={t("bodyweight.historyTitle")} onClose={onClose} hideOk testId="bodyweight-history-sheet"> */}
      <SheetShell title={t("profile.bodyweight")} onClose={closeFromOverlay} hideOk testId="bodyweight-sheet">
        {/* [개선] 바로 입력 — 기록 시트와 같은 입력·인바디 펼침·±30% 확인. 저장하면 아래 목록 맨 위에 새 줄, 시트는 열린 채.
            「지난 기록 … · 날짜」 한 줄은 바로 아래 목록과 겹쳐 빼고(last 없음), ±30% 기준은 최근 기록으로 준다 */}
        <div className="mt-[var(--spacing-sm)]">
          <WeighInSheet
            inline
            testId="bodyweight-entry"
            title={t("bodyweight.sheetRecordTitle")}
            unit={unit}
            initialKg={bodyweightKg ?? last?.kg ?? null}
            // [원본] last 없음 — 기록이 하나도 없으면 「지난 기록이 없어요 — 값을 맞춰 주세요」를 보인다(출발값 70.0 이 진짜 값처럼 보이지 않게 · 리뷰 L-1)
            last={last ? undefined : null}
            compareKg={last?.kg ?? null}
            onTypingChange={(v) => {
              typingRef.current = v;
            }}
            primaryLabel={t("bodyweight.save")}
            secondaryLabel={t("common.cancel")}
            onDismiss={onClose}
            inbody={{ skeletalMuscleKg: null, bodyFatPct: null }}
            onSave={async (kg, extras) => {
              await run(async () => {
                const repo = await import("@app/core/data/bodyweightRepository");
                await repo.addBodyweightLog({ weight: kg, unit: "kg", source: "manual", ...(extras ?? {}) });
              }, t("bodyweight.saved"));
            }}
          />
        </div>
        {/* 소제목 — 시트 제목(AppText)은 제목 요소가 아니라 h2(리뷰 L-3: h3 하나만 있으면 제목 목록에서 단계가 빈다) */}
        <h2
          className="mt-[var(--spacing-lg)] font-semibold text-(--color-ink2) text-[length:var(--text-sm)]"
          data-testid="bodyweight-history-heading"
        >
          {t("bodyweight.pastEntries")}
        </h2>
        {loaded && rows.length === 0 ? (
          <p
            className="mt-[var(--spacing-sm)] text-(--color-ink2) text-[length:var(--text-sm)]"
            data-testid="bodyweight-history-empty"
          >
            {t("bodyweight.historyEmpty")}
          </p>
        ) : (
          // data-loaded — 시험이 「다 읽은 목록」의 줄 수를 세게(읽기 전 빈 목록 ≠ 0개)
          <ul
            className="mt-[var(--spacing-sm)] flex flex-col"
            data-testid="bodyweight-history-list"
            data-loaded={loaded ? "1" : "0"}
          >
            {rows.map((l, i) => {
              const entry = `${formatBodyweight(l.weightKg, unit)}${unit} · ${formatBodyweightDate(l.measuredAt, true)}`;
              return (
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
                      {/* 인바디(SPEC-049 Phase 3) — 적은 줄만 · 보통 글자로 */}
                      {l.skeletalMuscleKg != null || l.bodyFatPct != null ? (
                        <span
                          data-testid="bodyweight-history-inbody"
                          className="ml-[6px] font-normal text-(--color-ink2) text-[length:var(--text-sm)]"
                        >
                          {[
                            l.skeletalMuscleKg != null
                              ? `${t("bodyweight.smmLabel")} ${l.skeletalMuscleKg.toFixed(1)}kg`
                              : null,
                            l.bodyFatPct != null
                              ? `${t("bodyweight.pbfLabel")} ${l.bodyFatPct.toFixed(1)}%`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      ) : null}
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
                    // 줄마다 같은 「고치기」만 들리지 않게 — 어느 기록인지 함께(qa P3-4)
                    aria-label={t("bodyweight.editAria", { entry })}
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
                    aria-label={t("bodyweight.deleteAria", { entry })}
                    onClick={() => setDeleting(l)}
                    className="flex h-[44px] min-w-[44px] items-center justify-center px-[var(--spacing-sm)] text-(--color-bad) text-[length:var(--text-sm)] underline underline-offset-2"
                  >
                    {t("bodyweight.delete")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {/* [원본] 이력이 있을 때만 · 보통 글자: {rows.length > 0 && bodyweightKg != null && userId ? ( … ) : null}
            [개선] 프로필 값만 있어도(이력 0) 보이고, 테두리 버튼으로(qa P3-8) */}
        {bodyweightKg != null && userId ? (
          <div className="mt-[var(--spacing-md)] border-(--color-line) border-t pt-[var(--spacing-md)]">
            <button
              type="button"
              data-testid="btn-bodyweight-unset"
              onClick={() => setConfirmUnset(true)}
              className="flex h-[44px] w-full items-center justify-center rounded-[var(--radius-md)] border border-(--color-line-strong) font-medium text-(--color-ink) text-[length:var(--text-md)] active:bg-(--color-surface-alt)"
            >
              {t("bodyweight.unsetAction")}
            </button>
            {/* [원본] <p className="mt-[4px] text-(--color-ink2) text-[length:var(--text-sm)]">{t("bodyweight.unsetCaption")}</p>
                [개선] 설명은 확인 창에만(같은 문장이 두 번 보였다) */}
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
              ? // 마지막 기록도 어느 값인지 한 줄 덧붙인다(qa P3-4)
                `${formatBodyweight(deleting.weightKg, unit)}${unit} · ${formatBodyweightDate(deleting.measuredAt, true)} — ${t("bodyweight.deleteLastConfirm")}`
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
