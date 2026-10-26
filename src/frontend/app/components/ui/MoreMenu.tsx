"use client";
// @plm SRS-054  ⋯ 메뉴 — 위험 동작(삭제·취소)과 드문 동작을 화면에서 빼서 바닥 시트 안에 둔다
//
// 누르면 선택지 시트가 열린다. 위험한 선택지는 destructive 로 붉게 — 실제 확인창은 호출부가 띄운다
// (무엇을 지우는지 문장이 화면마다 다르다).
import { useState } from "react";
import { ActionSheet, type SheetOption } from "./Dialog";
import { Icon } from "./Icon";

export function MoreMenu({
  options,
  title = "",
  label = "더보기",
  testId,
  sheetTestId,
  size = 22,
  vertical,
}: {
  options: SheetOption[];
  title?: string;
  label?: string;
  testId?: string;
  sheetTestId?: string;
  size?: number;
  /** 세로 점(⋮) — 종목 머리처럼 좁은 자리. */
  vertical?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        data-testid={testId}
        onClick={() => setOpen(true)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:opacity-60"
      >
        <Icon
          name="ellipsis-horizontal"
          size={size}
          color="var(--color-ink2)"
          className={vertical ? "rotate-90" : undefined}
        />
      </button>
      {open ? (
        <ActionSheet title={title} options={options} onClose={() => setOpen(false)} testId={sheetTestId} />
      ) : null}
    </>
  );
}
