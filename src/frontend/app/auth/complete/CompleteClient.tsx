"use client";
// @plm SRS-052  소셜 로그인 착지 화면
//
// 코드는 URL에 실려 왔다 — 받자마자 바꾸고 주소창에서 지운다(뒤로가기·공유로 새지 않게. 어차피 1회·60초다).
// 바꾼 뒤에는 평소 로그인과 **같은 길**(setTokens → 소유자 대조 → 동기)을 탄다.
import { navigate } from "@/lib/nav";
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useAuth } from "../../components/AuthProvider";
import { AuthPage } from "../../components/auth/AuthPage";
import { providerLabel } from "../../components/auth/providers";
import { useToast } from "../../components/Toast";
import { LogoSpinner } from "../../components/ui/LogoSpinner";
import { AppText } from "../../components/ui/primitives";

/** 같은 출처의 경로만 — 열린 리다이렉트 방지(서버도 거르지만 화면도 한 번 더). */
function safePath(p: string): string {
  return p.startsWith("/") && !p.startsWith("//") ? p : "/";
}

export default function CompleteClient({
  code,
  linked,
  via,
  returnTo,
}: {
  code: string;
  linked: string;
  /** 로그인 수단(연결이면 비어 있다) — 「최근」 배지 쿠키로 남는다. */
  via: string;
  returnTo: string;
}) {
  const { logInWithCode } = useAuth();
  const toast = useToast();
  const [failed, setFailed] = useState(!code);
  const once = useRef(false);

  useEffect(() => {
    if (!code || once.current) return;
    once.current = true;
    window.history.replaceState(null, "", "/auth/complete");
    logInWithCode(code, via)
      .then(() => {
        if (linked) toast(t("security.linkedToast", { provider: providerLabel(linked) }));
        navigate(safePath(returnTo || "/"), { replace: true });
      })
      .catch(() => setFailed(true));
  }, [code, linked, via, returnTo, logInWithCode, toast]);

  return (
    <AuthPage title={failed ? t("complete.failed") : t("complete.signingIn")}>
      <AppText
        variant="body"
        color={failed ? "danger" : "text"}
        className="block"
        data-testid={failed ? "complete-failed" : "complete-working"}
      >
        {failed ? t("complete.failed") : t("complete.signingIn")}
      </AppText>
      {failed ? null : (
        <div className="mt-[var(--spacing-lg)] flex justify-center">
          <LogoSpinner size={48} />
        </div>
      )}
      {failed ? (
        <a href="/account" className="mt-[var(--spacing-md)] block font-semibold text-(--color-brand)">
          {t("complete.back")}
        </a>
      ) : null}
    </AuthPage>
  );
}
