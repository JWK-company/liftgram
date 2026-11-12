"use client";
// @plm SRS-052  이메일 확인 화면 — 열자마자 한 번 확인한다(링크는 한 번만 통한다)
import { actionBoxClass } from "@/app/components/ui/Button";
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { authClient } from "@/lib/session";
import { useAuth } from "../components/AuthProvider";
import { AuthPage } from "../components/auth/AuthPage";
import { AppText } from "../components/ui/primitives";

export default function VerifyClient({ token }: { token: string }) {
  const { refreshMe } = useAuth();
  const [state, setState] = useState<"working" | "done" | "bad">(token ? "working" : "bad");
  // 개발 모드의 이중 마운트에서 두 번 부르면 두 번째가 "이미 사용됨"이 된다 — 한 번만.
  const once = useRef(false);

  useEffect(() => {
    if (!token || once.current) return;
    once.current = true;
    authClient()
      .verifyEmail({ token })
      .then(async () => {
        setState("done");
        await refreshMe().catch(() => {});
      })
      .catch(() => setState("bad"));
  }, [token, refreshMe]);

  return (
    // [원본] <AuthPage title={t("verify.verified")}> — 확인 중·실패에도 「확인된 이메일」이었다(화면 지도 2026-11-09)
    <AuthPage
      title={t(
        state === "done" ? "verify.verified" : state === "bad" ? "verify.titleFailed" : "verify.title",
      )}
    >
      <AppText
        variant="body"
        color={state === "bad" ? "danger" : "text"}
        className="block"
        data-testid={`verify-${state}`}
      >
        {state === "working"
          ? t("verify.verifying")
          : state === "done"
            ? t("verify.done")
            : t("verify.invalid")}
      </AppText>
      {state !== "working" ? (
        <a
          href="/account"
          // [원본] className="mt-[var(--spacing-md)] block font-semibold text-(--color-brand)" — 글자만(사용자 지시 2650)
          className={`${actionBoxClass("brand")} mt-[var(--spacing-md)] flex min-h-11 w-full px-[var(--spacing-md)] focus-visible:outline-2 focus-visible:outline-(--color-brand)`}
        >
          {t("complete.back")}
        </a>
      ) : null}
    </AuthPage>
  );
}
