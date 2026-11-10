"use client";
import {
  type Latest,
  RELEASE_CERT_SHA256,
  browserKind,
  normFp,
  sizeLabel,
  webOs,
} from "@app/core/domain/appDistribution";
import { useEffect, useState } from "react";
import { apkHref, fetchLatest } from "@/lib/appDistribution";
import { t } from "@/lib/i18n";
import { LogoSpinner } from "../components/ui/LogoSpinner";
import { AppText, Card } from "../components/ui/primitives";

export default function AppPageClient() {
  const [latest, setLatest] = useState<Latest | null | undefined>(undefined);
  const [env, setEnv] = useState<{ os: string; browser: string } | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    setEnv({ os: webOs(ua), browser: browserKind(ua) });
    void fetchLatest(true).then(setLatest);
  }, []);

  // [원본] "… rounded-[var(--radius-md)] …" · [개선] 버튼 둥근 정도 sm(Button 과 같다 · SPEC-056 F2)
  const linkCls =
    "flex min-h-[48px] items-center justify-center rounded-[var(--radius-sm)] bg-(--color-brand) px-[var(--spacing-lg)] font-semibold text-(--color-on-brand) focus-visible:outline-2 focus-visible:outline-(--color-ink) focus-visible:outline-offset-2";
  // 안내 파일의 지문이 앱에 박힌 릴리스 지문과 다르면 받기를 내지 않는다(REV-013 보안 M-2 — 바뀐 json 으로 남의 파일을 받게 하지 않게)
  const certOk = !!latest && normFp(latest.certSha256) === RELEASE_CERT_SHA256;

  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-[var(--spacing-md)] px-[var(--spacing-lg)] py-[var(--spacing-xl)]">
      <AppText variant="title" className="block" role="heading" aria-level={1}>
        {t("appPage.title")}
      </AppText>
      {latest === undefined || !env ? (
        <div
          className="flex justify-center py-[var(--spacing-xl)]"
          role="status"
          aria-label={t("appDist.loading")}
        >
          <LogoSpinner size={48} />
        </div>
      ) : latest === null ? (
        <AppText variant="body" color="textMuted" className="block" data-testid="app-page-unavailable">
          {t("appPage.unavailable")}
        </AppText>
      ) : (
        <>
          <AppText variant="body" className="block" data-testid="app-page-version">
            {t("appPage.version", { version: latest.versionName, size: sizeLabel(latest.size) })}
          </AppText>
          {env.os !== "android" ? (
            <AppText
              variant="caption"
              color="textMuted"
              className="block"
              data-testid="app-page-android-only"
            >
              {t("appPage.androidOnly")}
            </AppText>
          ) : null}
          {/* [원본] env.browser === "inapp" 만 보고 — 아이폰 인앱 브라우저에도 크롬 intent 를 냈다(REV-013 화면 L-11) */}
          {!certOk ? (
            <AppText
              variant="body"
              color="danger"
              role="alert"
              className="block"
              data-testid="app-page-cert-mismatch"
            >
              {t("appPage.certMismatch")}
            </AppText>
          ) : env.browser === "inapp" && env.os === "android" ? (
            <Card>
              <AppText variant="body" className="block" data-testid="app-page-inapp">
                {t("appPage.inapp")}
              </AppText>
              <a
                className={`mt-[var(--spacing-sm)] ${linkCls}`}
                data-testid="app-page-open-browser"
                href={`intent://${location.host}/app#Intent;scheme=https;package=com.android.chrome;end`}
              >
                {t("appPage.openBrowser")}
              </a>
            </Card>
          ) : (
            <a href={apkHref(latest.url)} download className={linkCls} data-testid="app-page-download">
              {t("appPage.download")}
            </a>
          )}
          <Card>
            <AppText variant="heading" className="block">
              {t("appPage.stepsTitle")}
            </AppText>
            <ol className="mt-[var(--spacing-xs)] list-decimal pl-[var(--spacing-lg)] text-(--color-ink2) text-[length:var(--text-sm)]">
              <li>{t("appPage.s1")}</li>
              <li>{t("appPage.s2")}</li>
              <li>{t("appPage.s3")}</li>
              <li>{t("appPage.s4")}</li>
            </ol>
          </Card>
          {/* [원본] 서명 지문(SHA-256) 전체를 보였다 — 파일 확인은 앱이 자동으로 한다(SPEC-025) */}
        </>
      )}
      <a
        href="/"
        className="flex min-h-[44px] items-center justify-center font-semibold text-(--color-brand) focus-visible:outline-2 focus-visible:outline-(--color-brand)"
      >
        {t("appPage.home")}
      </a>
    </div>
  );
}
