"use client";
// @plm SRS-052  소셜 로그인 버튼 — 서버가 켠 제공자만 그린다(GetAuthOptions)
//
// 자격증명이 없는 제공자의 버튼은 아예 없다 — 눌러서 제공자 화면에서 오류를 보느니 내리는 편이 낫다.
// 누르면 브라우저가 /api/auth/oauth/<제공자>/start 로 **전면 이동**한다(RPC가 아니다).
import { useEffect, useState } from "react";
import { authClient } from "@/lib/session";
import { t } from "@/lib/i18n";
import { AppText } from "../ui/primitives";
import type { LastLogin } from "@/lib/last-login";
import { BrandMark } from "./BrandMark";
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

/**
 * @plm SRS-052  「최근」 배지 — 이 기기에서 마지막으로 로그인한 방법의 버튼 오른쪽 위에 걸친다(booktarae d8790329).
 * 눈으로 보는 배지는 장식(aria-hidden)이고, 화면 낭독기에는 버튼 이름 뒤에 「최근에 로그인한 방법」 을 붙인다.
 * 판 = 글자색이 AA 되는 브랜드색(라이트 #C8381C/흰 글자 5.2:1 · 다크 #FF7A57/검은 글자 7.0:1).
 * 바깥 테두리를 카드색으로 둘러 같은 브랜드색인 이메일 버튼 위에서도 떨어져 보이게 한다.
 */
export function LastLoginBadge() {
  return (
    <>
      <span
        aria-hidden="true"
        data-testid="last-login-badge"
        className="pointer-events-none absolute -top-2.5 right-3 rounded-full bg-(--color-brand) px-2 py-0.5 font-semibold text-(--color-on-brand) text-[11px] leading-none ring-2 ring-(--color-card)"
      >
        {t("auth.lastBadge")}
      </span>
      <span className="sr-only">, {t("auth.lastBadgeSr")}</span>
    </>
  );
}

export function SocialButtons({
  returnTo,
  preview = [],
  last = null,
}: {
  returnTo?: string;
  preview?: string[];
  /** 이 기기에서 마지막으로 로그인한 방법 — 그 버튼에 「최근」 배지(미리보기 버튼에는 달지 않는다). */
  last?: LastLogin | null;
}) {
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
          data-last={last === p ? "1" : undefined}
          style={{ background: style(p).bg, color: style(p).fg, borderColor: style(p).border ?? style(p).bg }}
          className="relative flex h-12 items-center justify-center gap-[var(--spacing-sm)] rounded-[var(--radius-sm)] border font-medium"
        >
          <BrandMark p={p} />
          {t("auth.continueWith", { provider: providerLabel(p) })}
          {last === p ? <LastLoginBadge /> : null}
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
          className="flex h-12 items-center justify-center gap-[var(--spacing-sm)] rounded-[var(--radius-sm)] font-medium outline-2 -outline-offset-2 outline-dashed outline-(--color-line-strong)"
        >
          <BrandMark p={p} />
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
