// 없는 주소 — Next 기본 영어 404 대신 한국어 안내와 돌아갈 버튼(화면 지도 2026-11-09 「길이 이상한 곳」)
// [원본] 상태 코드는 Next 가 404 로 낸다. 종목 상세처럼 notFound() 를 부르는 화면도 이 화면을 쓴다.
// [개선] 상태 코드는 Next 가 404 로 낸다. notFound() 를 부르는 화면 중 자기 not-found 가 없는 곳(/diag/db 등)도 이 화면을 쓴다.
// [원본] import { t } from "@/lib/i18n";
// [원본] import { EmptyState } from "./components/ui/primitives";
// [원본]
// [원본] export default function NotFound() {
// [원본]   return (
// [원본]     <div className="flex flex-1 flex-col p-[var(--spacing-lg)]" data-testid="not-found">
// [원본]       <EmptyState
// [원본]         icon="help-circle-outline"
// [원본]         title={t("notFound.title")}
// [원본]         message={t("notFound.message")}
// [원본]         action={
// [원본]           <a
// [원본]             href="/"
// [원본]             data-testid="not-found-home"
// [원본]             className="inline-flex min-h-[44px] items-center rounded-[var(--radius-md)] bg-(--color-brand) px-[var(--spacing-lg)] font-semibold text-(--color-on-brand)"
// [원본]           >
// [원본]             {t("notFound.home")}
// [원본]           </a>
// [원본]         }
// [원본]       />
// [원본]     </div>
// [원본]   );
// [원본] }
// [개선] 화면 지도 #T17 — 「죄송해요. 찾는 화면이 없어요」 + 이유 + 운동 홈 / 뒤로 가기(공통 NotFoundView).
// 종목 상세는 자기 폴더의 not-found.tsx 로 「이 종목을 찾을 수 없어요」를 낸다.
import { NotFoundView } from "./components/notfound/NotFoundView";

export default function NotFound() {
  return <NotFoundView />;
}
