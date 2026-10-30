// 라벨 + 가로 스크롤 칩 줄 — app의 FilterRow와 같다. 종목 탭(CatalogClient)과 루틴 편집의 전체 화면 피커가 함께 쓴다(SRS-093).
import { AppText } from "./primitives";

export function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[var(--spacing-xs)]">
      <AppText variant="label" color="textFaint">
        {label}
      </AppText>
      <div className="no-scrollbar flex gap-[var(--spacing-sm)] overflow-x-auto py-[2px]">{children}</div>
    </div>
  );
}
