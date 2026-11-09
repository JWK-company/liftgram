// 없는 주소 — Next 기본 영어 404 대신 한국어 안내와 돌아갈 버튼(화면 지도 2026-11-09 「길이 이상한 곳」)
// 상태 코드는 Next 가 404 로 낸다. 종목 상세처럼 notFound() 를 부르는 화면도 이 화면을 쓴다.
import { t } from "@/lib/i18n";
import { EmptyState } from "./components/ui/primitives";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col p-[var(--spacing-lg)]" data-testid="not-found">
      <EmptyState
        icon="help-circle-outline"
        title={t("notFound.title")}
        message={t("notFound.message")}
        action={
          <a
            href="/"
            data-testid="not-found-home"
            className="inline-flex min-h-[44px] items-center rounded-[var(--radius-md)] bg-(--color-brand) px-[var(--spacing-lg)] font-semibold text-(--color-on-brand)"
          >
            {t("notFound.home")}
          </a>
        }
      />
    </div>
  );
}
