"use client";
// 화면 지도 #T17 — 404 화면의 「뒤로 가기」. 링크로 바로 열어 앞 기록이 없으면 운동 홈으로 보낸다
// (history.back() 이 아무 일도 안 하면 버튼이 고장 난 것처럼 보인다).
import { t } from "@/lib/i18n";

export function NotFoundBack() {
  return (
    <button
      type="button"
      data-testid="not-found-back"
      onClick={() => {
        // Navigation API 의 canGoBack 은 같은 사이트 앞 기록만 센다(새 탭·다른 사이트에서 온 링크면 false).
        // 없는 브라우저(옛 Safari 등)는 앞 기록이 있고 같은 사이트에서 왔을 때만 뒤로 — 다른 사이트로 나가지 않게(REV-108 #4).
        // (앱 안에서 링크로 옮겨 온 경우 referrer 가 비어 홈으로 갈 수 있다 — 나가 버리는 것보다 낫다)
        const nav = (window as unknown as { navigation?: { canGoBack?: boolean } }).navigation;
        const sameSiteReferrer = (() => {
          try {
            return document.referrer !== "" && new URL(document.referrer).origin === window.location.origin;
          } catch {
            return false;
          }
        })();
        const canBack =
          typeof nav?.canGoBack === "boolean" ? nav.canGoBack : window.history.length > 1 && sameSiteReferrer;
        if (canBack) window.history.back();
        else window.location.assign("/");
      }}
      className="inline-flex min-h-[44px] items-center rounded-[var(--radius-md)] border border-(--color-line) px-[var(--spacing-lg)] font-semibold text-(--color-ink)"
    >
      {t("notFound.back")}
    </button>
  );
}
