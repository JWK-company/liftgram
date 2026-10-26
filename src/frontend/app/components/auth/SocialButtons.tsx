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

export function SocialButtons({ returnTo }: { returnTo?: string }) {
  const providers = useAuthProviders();
  if (!providers.length) return null;
  return (
    <div
      className="mb-[var(--spacing-lg)] flex flex-col gap-[var(--spacing-sm)]"
      data-testid="social-buttons"
    >
      {providers.map((p) => {
        const st = PROVIDER_STYLE[p as Provider] ?? {
          bg: "var(--color-surface-alt)",
          fg: "var(--color-ink)",
        };
        return (
          <a
            key={p}
            href={startUrl(p, { returnTo })}
            data-testid={`btn-oauth-${p}`}
            style={{ background: st.bg, color: st.fg, borderColor: st.border ?? st.bg }}
            className="flex h-12 items-center justify-center rounded-[var(--radius-md)] border font-semibold"
          >
            {t("auth.continueWith", { provider: providerLabel(p) })}
          </a>
        );
      })}
      <div className="my-[var(--spacing-xs)] flex items-center gap-[var(--spacing-sm)]">
        <span className="h-px flex-1 bg-(--color-line)" />
        <AppText variant="caption" color="textMuted">
          {t("auth.orDivider")}
        </AppText>
        <span className="h-px flex-1 bg-(--color-line)" />
      </div>
    </div>
  );
}
