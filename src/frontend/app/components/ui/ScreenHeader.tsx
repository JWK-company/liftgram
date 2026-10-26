// @plm SRS-051 SRS-054  화면 머리 — 앱바 2형(AppBar.tsx)으로 그린다
//
// 기존 호출(title · right · back 노드)을 그대로 받는다 — 20곳 넘는 화면이 고치지 않고 새 형을 입는다.
//   · back 이 없으면 탭 첫 화면형: 큰 제목 + 오른쪽 아이콘.
//   · back 이 있으면 하위 화면형: ← · 가운데 제목 · 오른쪽 한 자리.
// 뒤로 노드는 화면마다 표식(gyms-back 등)과 갈 곳이 달라 호출부가 만든다 — 여기서는 44px 칸만 준다.
import type { ReactNode } from "react";

const BAR =
  "sticky top-0 z-30 flex min-h-14 items-center border-(--color-line) border-b bg-(--color-surface)/95 backdrop-blur";

export function ScreenHeader({
  title,
  right,
  back,
}: {
  title: string;
  right?: ReactNode;
  /** 뒤로 가기 자리(스택 화면). 탭 화면에는 없다. */
  back?: ReactNode;
}) {
  if (!back) {
    return (
      <header className={`${BAR} gap-[var(--spacing-sm)] px-[var(--spacing-lg)]`}>
        <h1
          data-testid="screen-title"
          className="truncate font-bold text-[length:var(--text-xl)] tracking-tight"
        >
          {title}
        </h1>
        {right ? <div className="ml-auto flex items-center">{right}</div> : null}
      </header>
    );
  }
  return (
    <header
      className={`${BAR} grid grid-cols-[minmax(48px,auto)_1fr_minmax(48px,auto)] px-[var(--spacing-xs)]`}
    >
      <div className="flex h-11 min-w-11 items-center justify-center [&>*]:flex [&>*]:h-11 [&>*]:w-11 [&>*]:items-center [&>*]:justify-center">
        {back}
      </div>
      <h1
        data-testid="screen-title"
        className="truncate px-[var(--spacing-xs)] text-center font-semibold text-[length:var(--text-md)]"
      >
        {title}
      </h1>
      <div className="flex items-center justify-end pr-[var(--spacing-sm)]">{right}</div>
    </header>
  );
}
