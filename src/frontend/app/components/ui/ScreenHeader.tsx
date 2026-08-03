// @plm SRS-007  화면 머리 — app의 네비게이션 헤더를 웹으로 옮긴 것
//
// app은 화면마다 제목이 상단에 뜨고(react-navigation 헤더), 필요하면 오른쪽에 액션 하나가 붙는다
// (예: 종목 목록의 '+ 커스텀 운동'). 로고 바는 없다 — 그래서 여기도 로고를 두지 않는다.
//
// 배경은 surface, 그림자는 없다(headerShadowVisible={false}).
import type { ReactNode } from "react";
import { AppText } from "./primitives";

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
  return (
    <header className="sticky top-0 z-30 flex items-center gap-[var(--spacing-sm)] bg-(--color-surface) px-[var(--spacing-lg)] py-[var(--spacing-md)]">
      {back}
      <AppText variant="heading" data-testid="screen-title">
        {title}
      </AppText>
      {right ? <div className="ml-auto">{right}</div> : null}
    </header>
  );
}
