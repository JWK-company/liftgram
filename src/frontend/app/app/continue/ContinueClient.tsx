"use client";
// SPEC-018 §7  넘기기 확인 화면(크롬 탭) — 마스킹한 계정 · 경고 문구 · 「계속」은 사용자 클릭으로만 RPC 를 부른다.
import { isChallenge, maskEmail } from "@app/core/domain/appContinue";
import { useState } from "react";
import { t } from "@/lib/i18n";
import type { LastLogin } from "@/lib/last-login";
import { authClient } from "@/lib/session";
import { useAuth } from "../../components/AuthProvider";
import { AuthPage } from "../../components/auth/AuthPage";
import AuthClient from "../../components/profile/AuthClient";
import { actionBoxClass, Button } from "../../components/ui/Button";
import { LogoSpinner } from "../../components/ui/LogoSpinner";
import { AppText, Card } from "../../components/ui/primitives";

export default function ContinueClient({
  ac,
  siteKey,
  preview,
  lastLogin,
}: {
  ac: string;
  siteKey: string;
  preview: string[];
  lastLogin: LastLogin | null;
}) {
  // [원본] const { user, restoring } = useAuth(); — 캐시된 사용자로 확인을 그려, 세션이 죽었으면 엉뚱한 실패 문구(REV-012 화면 L-4)
  const { user, restoring, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [appUrl, setAppUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isChallenge(ac)) {
    return (
      <AuthPage title={t("appContinue.title")}>
        <AppText variant="body" color="danger" className="block" data-testid="continue-bad-link">
          {t("appContinue.badLink")}
        </AppText>
      </AuthPage>
    );
  }
  if (restoring || loading) {
    return (
      <AuthPage title={t("appContinue.title")}>
        <div className="flex justify-center">
          <LogoSpinner size={48} />
        </div>
      </AuthPage>
    );
  }
  if (!user) {
    // 로그인한 뒤 같은 화면으로 — 소셜은 returnTo, 이메일은 이 자리에서 user 가 생겨 아래 확인으로 바뀐다
    return (
      <div className="flex flex-1 flex-col">
        <AppText
          variant="body"
          className="mx-auto mt-[var(--spacing-lg)] block w-full max-w-[440px] px-[var(--spacing-lg)]"
          data-testid="continue-need-login"
        >
          {t("appContinue.needLogin")}
        </AppText>
        <AuthClient
          siteKey={siteKey}
          preview={preview}
          lastLogin={lastLogin}
          returnTo={`/app/continue?ac=${encodeURIComponent(ac)}`}
          hideAppContinue
        />
      </div>
    );
  }

  const go = () => {
    setBusy(true);
    setError(null);
    void authClient()
      .createAppContinue({ challenge: ac })
      .then((r) => {
        if (!r.appUrl.startsWith("liftgram://auth?code=")) throw new Error("bad app url");
        setSent(true);
        setAppUrl(r.appUrl);
        window.location.href = r.appUrl;
      })
      .catch(() => setError(t("appContinue.failed")))
      .finally(() => setBusy(false));
  };

  const shown = maskEmail(user.email);
  return (
    <AuthPage title={t("appContinue.title")}>
      <AppText variant="body" className="mb-[var(--spacing-md)] block">
        {t("appContinue.ask")}
      </AppText>
      <Card className="mb-[var(--spacing-md)]">
        <AppText variant="heading" className="block truncate" data-testid="continue-name">
          {user.displayName || shown}
        </AppText>
        {user.displayName && shown ? (
          <AppText
            variant="caption"
            color="textMuted"
            className="mt-[2px] block truncate"
            data-testid="continue-email"
          >
            {shown}
          </AppText>
        ) : null}
      </Card>
      <AppText
        variant="caption"
        color="danger"
        className="mb-[var(--spacing-lg)] block"
        role="note"
        data-testid="continue-warn"
      >
        {t("appContinue.warn")}
      </AppText>
      {sent ? (
        <>
          <AppText variant="body" className="block" data-testid="continue-returning">
            {t("appContinue.returning")}
          </AppText>
          {/* REV-012 화면 M-4 — 응답이 늦어 크롬이 자동 열기를 막아도 사람이 눌러 열 수 있게(코드는 60초 유효) */}
          {appUrl ? (
            <a
              href={appUrl}
              // [원본] className="mt-[var(--spacing-md)] block text-center font-semibold text-(--color-brand)" — 글자만(사용자 지시 2650)
              className={`${actionBoxClass("brand")} mt-[var(--spacing-md)] flex min-h-11 w-full px-[var(--spacing-md)] focus-visible:outline-2 focus-visible:outline-(--color-brand)`}
              data-testid="continue-open-app"
            >
              {t("appDist.openApp")}
            </a>
          ) : null}
        </>
      ) : (
        <>
          <Button title={t("appContinue.go")} onPress={go} loading={busy} testId="btn-continue" />
          <a
            // [원본] href="liftgram://start" — 앱이 「PWA 에서 바꾸기」로 읽어 강조를 켰다(REV-012 화면 M-1)
            href="liftgram://auth?cancel=1"
            // [원본] className="mt-[var(--spacing-md)] block text-center font-semibold text-(--color-brand)" — 글자만(사용자 지시 2650)
            className={`${actionBoxClass("neutral")} mt-[var(--spacing-md)] flex min-h-11 w-full px-[var(--spacing-md)] focus-visible:outline-2 focus-visible:outline-(--color-brand)`}
            data-testid="continue-other"
          >
            {t("appContinue.other")}
          </a>
        </>
      )}
      {error ? (
        <AppText
          variant="caption"
          color="danger"
          className="mt-[var(--spacing-md)] block"
          role="alert"
          data-testid="continue-error"
        >
          {error}
        </AppText>
      ) : null}
    </AuthPage>
  );
}
