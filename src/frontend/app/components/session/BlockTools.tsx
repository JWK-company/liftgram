"use client";
// @plm SRS-084 SRS-069  블록 도구 한 줄(피드백 #62) — 휴식 시간 · 메모 · 순서 위/아래를 ⋯ 메뉴 밖으로
//
//   ⌃⌄  ·  ⏱ 휴식 2:00  ·  ✎ 메모(또는 메모 첫 줄)
//
// 순서 버튼은 **맨 왼쪽**이다(피드백 · 2026-10-28). 오른쪽 끝에 있을 때 ⌄ 가 「메모를 더 펼치기」처럼 읽혔다.
//
// 화면 정리 규칙을 그대로 따른다: 회색 글자·아이콘(빨강 없음) · 누르는 자리 44px(보이는 아이콘은 작게) · 빈 값은 짧게.
// 자리는 **세트 추가 아래** — 블록 머리(첫 세트까지의 거리 · 화면 정리 측정)를 건드리지 않고, 세트를 적는 동안은 시선 밖이다.
// 순서 버튼은 위아래로 붙어 있던 22×28px 두 개가 잘못 눌리던 것(/qa code M-5)을 좌우로 떼고 누르는 자리를 키운 것이다.
// testid 는 메뉴 시절 그대로(btn-move-up·btn-move-down·btn-rest-setting·btn-note-open).
import { t } from "@/lib/i18n";
import { chipFaceClass } from "../ui/ValueChip";
import { Icon } from "../ui/Icon";

/** 「2:00」 — 분은 앞 0 없이(휴식 시간은 10분을 넘지 않는다). */
export function formatRestShort(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 순서 위/아래 — 보이는 아이콘 18px, 누르는 자리 44×44(tight 는 36×44 붙여서). 없는 방향은 흐리게 비활성(자리는 지킨다). */
export function MoveButtons({
  onMoveUp,
  onMoveDown,
  compact = false,
  tight = false,
  testIdPrefix = "btn-move",
}: {
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** 좁은 머리 줄(슈퍼셋 묶음) — 보이는 자리 28px, 누르는 자리는 의사 요소로 44px(줄 높이를 늘리지 않는다) */
  compact?: boolean;
  /** 블록 도구 줄 — 두 버튼을 붙인다(폭 36 · 높이 44 · 사이 0 — 아이콘 사이가 36px 로 좁아진다 · 피드백 2026-10-28) */
  tight?: boolean;
  testIdPrefix?: string;
}) {
  if (!onMoveUp && !onMoveDown) return null;
  const box = compact
    ? "relative h-7 w-7 before:absolute before:-inset-[8px] before:content-['']"
    : tight
      ? "h-11 w-9"
      : "h-11 w-11";
  const one = (dir: "up" | "down", fn?: () => void) => (
    <button
      type="button"
      data-testid={`${testIdPrefix}-${dir}`}
      aria-label={dir === "up" ? t("session.moveUp") : t("session.moveDown")}
      disabled={!fn}
      onClick={fn}
      className={`flex shrink-0 items-center justify-center rounded-[var(--radius-pill)] ${box} ${
        fn ? "active:bg-(--color-surface-alt)" : ""
      }`}
    >
      <Icon
        name={dir === "up" ? "chevron-up" : "chevron-down"}
        size={18}
        color={fn ? "var(--color-ink3)" : "var(--color-line)"}
      />
    </button>
  );
  return (
    // compact 는 누르는 자리(28+8+8)가 서로 겹치지 않게 16px 띄운다
    <div className={`flex shrink-0 items-center ${compact ? "gap-[16px]" : tight ? "gap-0" : "gap-[4px]"}`}>
      {one("up", onMoveUp)}
      {one("down", onMoveDown)}
    </div>
  );
}

export function BlockTools({
  restSeconds,
  restKindChanged = false,
  onRest,
  note,
  onNote,
  onMoveUp,
  onMoveDown,
}: {
  restSeconds: number;
  /** 세트 종류별 휴식을 바꾼 값이 있다(SPEC-051) — 칩 끝에 작은 점 */
  restKindChanged?: boolean;
  onRest: () => void;
  /** 저장된(또는 쓰는 중인) 메모 — 있으면 첫 줄을 미리 보인다 */
  note: string;
  onNote: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const preview = note.trim().split("\n")[0]?.trim() ?? "";
  return (
    <div
      data-testid="block-tools"
      className="mt-[2px] flex min-h-[44px] items-center gap-x-[6px] text-[length:var(--text-sm)] text-(--color-ink2)"
    >
      {/* [개선] 순서 버튼을 맨 왼쪽으로(피드백) — 없으면(종목 하나) 점도 없다 */}
      {onMoveUp || onMoveDown ? (
        <>
          <div className="-ml-[8px]">
            <MoveButtons onMoveUp={onMoveUp} onMoveDown={onMoveDown} tight />
          </div>
          <span aria-hidden className="text-(--color-ink3)">
            ·
          </span>
        </>
      ) : null}
      <button
        type="button"
        data-testid="btn-rest-setting"
        onClick={onRest}
        // [원본] aria-label={`${t("session.restTime")} — ${formatRestShort(restSeconds)}`}
        aria-label={`${t("session.restTime")} — ${formatRestShort(restSeconds)}${restKindChanged ? ` · ${t("session.restKindDot")}` : ""}`}
        data-rest-kind-changed={restKindChanged ? "1" : "0"}
        // [원본] 바탕 없는 회색 아이콘 + 글자 — 「휴식 시간을 바꾸는 곳」인지 몰랐다(사용성 1)
        // [개선] 값 칩 — 바깥 44px 누르는 자리는 그대로(feedback-62-64), 바탕은 안쪽(SPEC-046)
        className="inline-flex min-h-[44px] shrink-0 items-center rounded-[var(--radius-sm)] tabular-nums focus-visible:outline-2 focus-visible:outline-(--color-brand)"
      >
        <span
          data-chip-face=""
          className={`inline-flex items-center gap-[4px] rounded-[10px] px-[6px] py-[2px] ${chipFaceClass("default", false)}`}
        >
          <Icon name="timer-outline" size={14} color="var(--color-ink3)" />
          {t("session.restShort", { time: formatRestShort(restSeconds) })}
          {/* 종류별로 바꾼 값이 있으면 작은 점(SPEC-051) — 회색(빨강은 완료 전용) */}
          {restKindChanged ? (
            <span
              aria-hidden
              data-testid="rest-kind-dot"
              className="inline-block h-[6px] w-[6px] shrink-0 rounded-full bg-(--color-ink2)"
            />
          ) : null}
        </span>
      </button>
      <span aria-hidden className="text-(--color-ink3)">
        ·
      </span>
      <button
        type="button"
        data-testid="btn-note-open"
        data-has-note={preview ? "1" : "0"}
        onClick={onNote}
        aria-label={preview ? t("session.noteEditAria", { note: preview }) : t("session.notePlaceholder")}
        // [원본] 바탕 없는 연필 + 글자(flex-1) · [개선] 값 칩 — 바탕은 글자 길이만큼(max-w · 줄 전체 회색 막대 금지 · REV-084 9)
        // 누르는 자리도 칩만큼(flex-1 이면 칩 오른쪽 빈 곳도 눌렸다 · P1 코드 리뷰 시각 6)
        className="inline-flex min-h-[44px] min-w-0 shrink items-center rounded-[var(--radius-sm)] text-left focus-visible:outline-2 focus-visible:outline-(--color-brand)"
      >
        <span
          data-chip-face=""
          className={`inline-flex min-w-0 max-w-full items-center gap-[4px] rounded-[10px] px-[6px] py-[2px] ${chipFaceClass("default", false)}`}
        >
          <Icon name="create-outline" size={14} color="var(--color-ink3)" />
          <span className="min-w-0 truncate">{preview || t("session.noteShort")}</span>
        </span>
      </button>
      {/* [원본] 오른쪽 끝 — ⌄ 가 메모 펼치기로 읽혔다
      <MoveButtons onMoveUp={onMoveUp} onMoveDown={onMoveDown} /> */}
    </div>
  );
}
