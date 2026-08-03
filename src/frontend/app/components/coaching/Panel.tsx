"use client";
// @plm SRS-048  코칭용 판(panel) — 제목 + 스크롤되는 내용 + 아래 버튼
//
// 기존 `Dialog.tsx`의 것들은 **짧은 확인**용이다(확인/취소·선택 목록). 코칭에서 띄우는 것은
// 리포트·루틴 목록·이력처럼 **길어질 수 있는 내용**이라, 화면을 넘치지 않게 안쪽이 스크롤돼야 한다.
// 그 차이 하나 때문에 여기 따로 둔다 — 겉모습(포털·배경·Esc 닫기)은 `Overlay`를 그대로 쓴다.
import type { ReactNode } from "react";
import { Overlay } from "../ui/Dialog";
import { AppText } from "../ui/primitives";

export function Panel({
  title,
  onClose,
  actions,
  testId,
  children,
}: {
  title: string;
  onClose: () => void;
  actions?: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <Overlay onClose={onClose} testId={testId}>
      <AppText variant="heading" className="block">
        {title}
      </AppText>
      {/* 내용이 길어도 판이 화면을 넘지 않는다 — 넘치면 여기서만 스크롤된다. */}
      <div className="mt-[var(--spacing-sm)] max-h-[60vh] overflow-y-auto">{children}</div>
      {actions ? <div className="mt-[var(--spacing-md)] flex gap-[var(--spacing-sm)]">{actions}</div> : null}
    </Overlay>
  );
}
