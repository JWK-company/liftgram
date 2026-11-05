"use client";
// 개인정보처리방침 변경 공지(SPEC-029) — 방침이 약속한 대로 시행 7일 전부터 시행일까지 홈·피드 위에 띄운다.
// 운동 중에는 띄우지 않는다. 닫으면 이 기기에서 다시 뜨지 않는다.
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useSession } from "../SessionProvider";
import { Icon } from "../ui/Icon";

// [원본] liftgram.policyNotice.20261112 — 사진 자동 검사가 공지에 더해져 닫은 사람에게도 다시 보인다(SPEC-031)
// [원본] liftgram.policyNotice.20261112b — 시행일을 11월 5일로 앞당겨 문구가 바뀌었다
const DISMISS_KEY = "liftgram.policyNotice.20261105";
/** 시행일이 11월 5일로 앞당겨졌다. 시행 뒤 안내로 원래 끝나던 날까지 보인다. */
const SHOW_UNTIL = Date.parse("2026-11-13T00:00:00+09:00");

export function PolicyNoticeBanner() {
  const path = usePathname();
  const { activeWorkoutId } = useSession();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (Date.now() >= SHOW_UNTIL) return;
    try {
      setShow(localStorage.getItem(DISMISS_KEY) === null);
    } catch {
      setShow(true);
    }
  }, []);

  if (!show || activeWorkoutId || (path !== "/" && path !== "/feed")) return null;

  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // 저장할 수 없어도 이번 화면에서는 닫는다
    }
  };

  return (
    <div
      role="status"
      data-testid="policy-notice"
      className="flex items-center gap-[var(--spacing-sm)] border-(--color-line) border-b px-[var(--spacing-md)] py-[var(--spacing-xs)] text-xs text-(--color-ink2)"
    >
      <a href="/privacy" className="min-w-0 flex-1 underline" data-testid="policy-notice-link">
        {t("legal.policyNotice")}
      </a>
      <a href="/terms" className="shrink-0 underline" data-testid="policy-notice-terms">
        {t("legal.policyNoticeTerms")}
      </a>
      <button
        type="button"
        onClick={close}
        aria-label={t("legal.policyNoticeClose")}
        data-testid="policy-notice-close"
        className="flex h-[44px] w-[44px] shrink-0 items-center justify-center"
      >
        <Icon name="close" size={16} color="var(--color-ink2)" />
      </button>
    </div>
  );
}
