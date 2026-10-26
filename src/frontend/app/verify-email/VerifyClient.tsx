"use client";
// @plm SRS-052  이메일 확인 화면 — 열자마자 한 번 확인한다(링크는 한 번만 통한다)
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
    <AuthPage title={t("verify.verified")}>
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
        <a href="/account" className="mt-[var(--spacing-md)] block font-semibold text-(--color-brand)">
          {t("complete.back")}
        </a>
      ) : null}
    </AuthPage>
  );
}
