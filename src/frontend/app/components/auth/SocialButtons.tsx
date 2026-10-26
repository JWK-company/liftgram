"use client";
// @plm SRS-052  소셜 로그인 버튼 — 서버가 켠 제공자만 그린다(GetAuthOptions)
//
// 자격증명이 없는 제공자의 버튼은 아예 없다 — 눌러서 제공자 화면에서 오류를 보느니 내리는 편이 낫다.
// 누르면 브라우저가 /api/auth/oauth/<제공자>/start 로 **전면 이동**한다(RPC가 아니다).
import { useEffect, useState } from "react";
import { authClient } from "@/lib/session";
import { t } from "@/lib/i18n";
import { AppText } from "../ui/primitives";
import { PROVIDER_STYLE, providerLabel, startUrl, type Provider } from "./providers";

/** 서버가 켠 인증 기능 — 소셜 제공자 목록과 메일 발송 여부. 화면 여러 곳이 같은 응답을 쓴다(한 번만 묻는다). */
let optionsOnce: Promise<{ providers: string[]; mailEnabled: boolean }> | null = null;
function loadOptions() {
  optionsOnce ??= authClient()
    .getAuthOptions({})
    .then((r) => ({ providers: r.providers, mailEnabled: r.mailEnabled }))
    .catch(() => {
      optionsOnce = null; // 다음 화면에서 다시 묻는다
      return { providers: [], mailEnabled: false };
    });
  return optionsOnce;
}

export function useAuthOptions(): { providers: string[]; mailEnabled: boolean } {
  const [opts, setOpts] = useState({ providers: [] as string[], mailEnabled: false });
  useEffect(() => {
    let alive = true;
    void loadOptions().then((o) => alive && setOpts(o));
    return () => {
      alive = false;
    };
  }, []);
  return opts;
}

export function useAuthProviders(): string[] {
  return useAuthOptions().providers;
}

export function SocialButtons({ returnTo, preview = [] }: { returnTo?: string; preview?: string[] }) {
  const providers = useAuthProviders();
  const [notice, setNotice] = useState<string | null>(null);
  // 미리보기 = 키가 아직 없어 **눌러도 나가지 않는** 제공자(booktarae [임시-소셜설정전]과 같은 판단).
  // 키가 들어와 진짜로 켜지면 미리보기 목록에 남아 있어도 자동으로 진짜 버튼이 된다.
  const previewOnly = preview.filter((p) => !providers.includes(p));
  if (!providers.length && !previewOnly.length) return null;
  const style = (p: string) =>
    PROVIDER_STYLE[p as Provider] ?? { bg: "var(--color-surface-alt)", fg: "var(--color-ink)" };
  return (
    <div
      className="mb-[var(--spacing-md)] flex flex-col gap-[var(--spacing-sm)]"
      data-testid="social-buttons"
    >
      {providers.map((p) => (
        <a
          key={p}
          href={startUrl(p, { returnTo })}
          data-testid={`btn-oauth-${p}`}
          style={{ background: style(p).bg, color: style(p).fg, borderColor: style(p).border ?? style(p).bg }}
          className="flex h-12 items-center justify-center rounded-[var(--radius-md)] border font-semibold"
        >
          {t("auth.continueWith", { provider: providerLabel(p) })}
        </a>
      ))}
      {/* 브랜드 색 그대로 + 파선·"설정 필요" — 완성된 화면이 어떻게 보이는지 확인하되, 누르면 나가지 않는다. */}
      {previewOnly.map((p) => (
        <button
          key={p}
          type="button"
          data-testid={`btn-oauth-${p}`}
          data-preview="1"
          onClick={() => setNotice(t("auth.setupNotice", { provider: providerLabel(p) }))}
          style={{ background: style(p).bg, color: style(p).fg }}
          className="flex h-12 items-center justify-center gap-[var(--spacing-sm)] rounded-[var(--radius-md)] font-semibold outline-2 -outline-offset-2 outline-dashed outline-(--color-line)"
        >
          <span>{t("auth.continueWith", { provider: providerLabel(p) })}</span>
          <span className="rounded-full border border-(--color-line) bg-(--color-card) px-2 py-0.5 text-xs text-(--color-ink2)">
            {t("auth.setupNeeded")}
          </span>
        </button>
      ))}
      {notice ? (
        <AppText
          variant="caption"
          color="textMuted"
          className="block text-center"
          role="status"
          data-testid="oauth-setup-notice"
        >
          {notice}
        </AppText>
      ) : null}
      <div className="my-[var(--spacing-xs)] flex items-center gap-[var(--spacing-sm)]">
        <span className="h-px flex-1 bg-(--color-line)" />
        <AppText variant="caption" color="textMuted">
          {t("auth.emailDivider")}
        </AppText>
        <span className="h-px flex-1 bg-(--color-line)" />
      </div>
    </div>
  );
}
