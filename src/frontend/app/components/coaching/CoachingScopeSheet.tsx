"use client";
// 코칭 범위 시트(SPEC-050 P1b) — 회원이 무엇을 코치에게 보여 줄지 고른다.
//
//   스위치 4개   운동 기록·분석(켬) · 코치가 짠 루틴 받기 · 내 루틴 처방 고치기(켬) · 체중·인바디(끔) · 지난 기록도(끔)
//   요청 때만    한 줄 메시지(100자 — 목표·주 몇 회)
//   맨 아래      주 버튼 하나(빨강 채움은 이 시트에 그것 하나) + 취소
//
// 켜진 스위치는 청록(--color-coaching) — 빨강은 주 버튼 몫이다. 범위를 정하는 것은 언제나 회원이고,
// 서버도 회원 쪽 값만 저장한다(코치가 수락할 때는 이 시트를 띄우지 않는다).
import { useId, useState, type ReactNode } from "react";
import { DEFAULT_SCOPE, MAX_REQUEST_NOTE, type ScopeValue } from "@/lib/coaching";
import { t, type TransKey } from "@/lib/i18n";
import { Button } from "../ui/Button";
import { Overlay } from "../ui/Dialog";
import { AppText } from "../ui/primitives";

export type ScopeSheetMode = "request" | "accept" | "join" | "change";

const TITLE: Record<ScopeSheetMode, TransKey> = {
  request: "coaching.scope.requestTitle",
  accept: "coaching.scope.acceptTitle",
  join: "coaching.join.title",
  change: "coaching.scope.changeTitle",
};
const CONFIRM: Record<ScopeSheetMode, TransKey> = {
  request: "coaching.scope.requestConfirm",
  accept: "coaching.scope.acceptConfirm",
  join: "coaching.scope.joinConfirm",
  change: "coaching.scope.changeConfirm",
};

const ROWS: { key: keyof ScopeValue; title: TransKey; hint: TransKey }[] = [
  { key: "logView", title: "coaching.scope.logView", hint: "coaching.scope.logViewHint" },
  { key: "routineEdit", title: "coaching.scope.routineEdit", hint: "coaching.scope.routineEditHint" },
  { key: "bodyView", title: "coaching.scope.bodyView", hint: "coaching.scope.bodyViewHint" },
  { key: "pastRecords", title: "coaching.scope.pastRecords", hint: "coaching.scope.pastRecordsHint" },
];

export function CoachingScopeSheet({
  mode,
  initial = DEFAULT_SCOPE,
  header,
  busy = false,
  error,
  onConfirm,
  onClose,
}: {
  mode: ScopeSheetMode;
  initial?: ScopeValue;
  /** 시트 머리 — 코치 카드 등 */
  header?: ReactNode;
  busy?: boolean;
  /** 서버가 거절한 문구(errorText) — 시트 안에 보인다 */
  error?: string | null;
  onConfirm: (scope: ScopeValue, note: string) => void;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<ScopeValue>({ ...initial });
  const [note, setNote] = useState("");
  const noteId = useId();

  return (
    <Overlay onClose={onClose} testId="coaching-scope-sheet" placement="bottom" ariaLabel={t(TITLE[mode])}>
      <AppText variant="heading" className="block">
        {t(TITLE[mode])}
      </AppText>
      {header ? <div className="mt-[var(--spacing-md)]">{header}</div> : null}

      <AppText variant="label" color="textMuted" className="mt-[var(--spacing-lg)] block">
        {t("coaching.scope.title")}
      </AppText>
      <div className="mt-[var(--spacing-xs)] overflow-hidden rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-card) [&>*+*]:border-(--color-line) [&>*+*]:border-t">
        {ROWS.map((r) => (
          <ScopeSwitch
            key={r.key}
            testId={`scope-${r.key}`}
            title={t(r.title)}
            hint={t(r.hint)}
            on={scope[r.key]}
            onToggle={() => setScope((s) => ({ ...s, [r.key]: !s[r.key] }))}
          />
        ))}
      </div>
      <AppText variant="caption" color="textFaint" className="mt-[var(--spacing-xs)] block">
        {t("coaching.scope.hint")}
      </AppText>

      {mode === "request" ? (
        <div className="mt-[var(--spacing-md)]">
          <label htmlFor={noteId} className="mb-[var(--spacing-xs)] block">
            <AppText variant="label" color="textMuted">
              {t("coaching.scope.noteLabel")}
            </AppText>
          </label>
          <input
            id={noteId}
            data-testid="scope-note"
            value={note}
            maxLength={MAX_REQUEST_NOTE}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("coaching.scope.notePlaceholder")}
            className="min-h-11 w-full rounded-[var(--radius-sm)] border border-(--color-line-strong) bg-(--color-card) px-[var(--spacing-md)] py-[var(--spacing-sm)] text-(--color-ink) text-[length:var(--text-md)] outline-none placeholder:text-(--color-ink3) focus:border-(--color-brand) focus:ring-(--color-brand) focus:ring-1"
          />
          <AppText variant="caption" color="textFaint" className="mt-[2px] block text-right">
            {`${[...note].length}/${MAX_REQUEST_NOTE}`}
          </AppText>
        </div>
      ) : null}

      {error ? (
        <AppText
          variant="caption"
          color="danger"
          className="mt-[var(--spacing-sm)] block"
          data-testid="scope-error"
        >
          {error}
        </AppText>
      ) : null}

      <div className="mt-[var(--spacing-md)] flex gap-[var(--spacing-sm)]">
        <div className="flex-1">
          <Button title={t("common.cancel")} variant="secondary" onPress={onClose} testId="scope-cancel" />
        </div>
        <div className="flex-1">
          <Button
            title={t(CONFIRM[mode])}
            loading={busy}
            onPress={() => onConfirm(scope, note.trim())}
            testId="scope-confirm"
          />
        </div>
      </div>
    </Overlay>
  );
}

/** 스위치 한 줄 — 켜짐은 청록 판(빨강을 쓰지 않는다). 누르는 자리 = 줄 전체(52px 이상). */
function ScopeSwitch({
  title,
  hint,
  on,
  onToggle,
  testId,
}: {
  title: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
  testId: string;
}) {
  const descId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={title}
      aria-describedby={descId}
      data-testid={testId}
      onClick={onToggle}
      className="flex min-h-[52px] w-full items-center gap-[var(--spacing-sm)] px-[var(--spacing-md)] py-[var(--spacing-sm)] text-left"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="break-words font-medium text-(--color-ink) text-[length:var(--text-md)]">
          {title}
        </span>
        <span id={descId} className="break-words text-(--color-ink2) text-[length:var(--text-sm)]">
          {hint}
        </span>
      </span>
      <span aria-hidden className="flex h-[44px] w-[52px] shrink-0 items-center justify-center">
        <span
          style={{ backgroundColor: on ? "var(--color-coaching)" : "var(--color-line-strong)" }}
          className="relative block h-[28px] w-[48px] rounded-[var(--radius-pill)] transition-colors"
        >
          <span
            style={{ transform: on ? "translateX(20px)" : "translateX(0)" }}
            className="absolute top-[2px] left-[2px] block h-[24px] w-[24px] rounded-full bg-(--color-surface) shadow transition-transform"
          />
        </span>
      </span>
    </button>
  );
}
