// 화면 지도 #T17 — 「없는 화면」 공통 모양: 사과하는 제목 + 짧은 이유 + 할 일 버튼(주 버튼 · 뒤로 가기).
// 숫자 404·영어 「not found」는 보이지 않는다(상태 코드만 404). 루트 not-found 와 종목 상세 not-found 가 같이 쓴다.
import { t, type TransKey } from "@/lib/i18n";
import { EmptyState } from "../ui/primitives";
import { NotFoundBack } from "./NotFoundBack";

export function NotFoundView({
  title = "notFound.title",
  message = "notFound.message",
  primaryHref = "/",
  primaryLabel = "notFound.home",
}: {
  title?: TransKey;
  message?: TransKey;
  primaryHref?: string;
  primaryLabel?: TransKey;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col p-[var(--spacing-lg)]" data-testid="not-found">
      <EmptyState
        icon="help-circle-outline"
        title={t(title)}
        message={t(message)}
        action={
          <div className="flex flex-wrap items-center justify-center gap-[var(--spacing-sm)]">
            <a
              href={primaryHref}
              data-testid="not-found-home"
              className="inline-flex min-h-[44px] items-center rounded-[var(--radius-md)] bg-(--color-brand) px-[var(--spacing-lg)] font-semibold text-(--color-on-brand)"
            >
              {t(primaryLabel)}
            </a>
            <NotFoundBack />
          </div>
        }
      />
    </div>
  );
}
