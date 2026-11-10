"use client";
// @plm SRS-052  로그인·보안 카드 — 이메일 확인 · 비밀번호 변경/설정 · 연결된 소셜 로그인
//
// 계정 화면(로그인 상태)에 붙는다. 세 가지를 한 카드에 모은다:
//   ① 이메일이 아직 확인 전이면 안내와 "확인 메일 다시 받기"(60초 간격 — 서버가 남은 초를 알려 준다)
//   ② 비밀번호 바꾸기 — 소셜로만 가입했으면 "설정"(현재 비밀번호 칸이 없다). 저장하면 다른 기기는 로그아웃
//   ③ 연결된 소셜 로그인 — 연결은 표(CreateLinkTicket)를 받아 제공자로 전면 이동, 해제는 마지막 수단이면 서버가 막는다
import { errorText } from "@/lib/errorText";
import type { Identity } from "@app/contracts";
import { ConnectError } from "@connectrpc/connect";
import { useCallback, useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { authClient, setTokens } from "@/lib/session";
import { useAuth } from "../AuthProvider";
import { Button } from "../ui/Button";
import { TextField } from "../ui/inputs";
import { AppText, Card } from "../ui/primitives";
import { useAuthOptions } from "./SocialButtons";
import { appSignIn } from "@/lib/native";
import { providerLabel, startUrl } from "./providers";

function errText(e: unknown): string {
  return e instanceof ConnectError ? e.rawMessage : String(e);
}

/** 이 계정에 연결된 소셜 로그인 목록. userId 가 바뀌면(로그인·전환) 다시 묻는다. */
export function useIdentities(userId?: string): [Identity[], () => void] {
  const [identities, setIdentities] = useState<Identity[]>([]);
  const load = useCallback(() => {
    if (!userId) {
      setIdentities([]);
      return;
    }
    authClient()
      .listIdentities({})
      .then((r) => setIdentities(r.identities))
      .catch(() => {});
  }, [userId]);
  useEffect(load, [load]);
  return [identities, load];
}

export function SecurityCard() {
  const { user, refreshMe } = useAuth();
  const { providers, mailEnabled } = useAuthOptions();
  const [identities, load] = useIdentities(user?.id);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  // @plm SRS-095  소셜 전용의 첫 비밀번호 설정은 최근 로그인이 필요하다 — 서버가 reauth_required 로 거절하면
  // 연결된 제공자로 다시 로그인하는 버튼을 띄운다(qa 재확인 H-1 · 삭제 카드와 같은 길).
  const [needReauth, setNeedReauth] = useState(false);

  if (!user) return null;
  const linked = new Set(identities.map((i) => i.provider));

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMsg(null);
    try {
      setMsg({ text: await fn() });
    } catch (e) {
      const raw = errText(e);
      if (raw === "reauth_required") {
        setNeedReauth(true);
        setMsg({ text: t("security.reauth"), bad: true });
      } else setMsg({ text: errorText(e), bad: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-[var(--spacing-lg)]" data-testid="security-card">
      <AppText variant="label" color="textMuted">
        {t("security.title")}
      </AppText>

      {/* ① 이메일 확인 */}
      {user.email ? (
        user.emailVerified || !mailEnabled ? (
          <AppText
            variant="caption"
            color="textMuted"
            className="mt-[var(--spacing-xs)] block"
            data-testid={user.emailVerified ? "email-verified" : "email-unverified"}
          >
            {/* 메일이 꺼진 환경에서는 확인을 요구하지 않는다 — 확인됐다고 거짓으로 말하지도 않는다. */}
            {user.emailVerified ? `${t("verify.verified")} · ` : ""}
            {user.email}
          </AppText>
        ) : (
          <div
            // [원본] className="mt-[var(--spacing-sm)] rounded-[var(--radius-md)] border border-(--color-warn) p-[var(--spacing-md)]" — 구역 안 상자
            // [개선] 상자 대신 왼쪽 경고색 강조선(SPEC-056 F1 · P6 코드 리뷰 M-1)
            className="mt-[var(--spacing-sm)] py-[var(--spacing-xs)] pl-[var(--spacing-md)]"
            style={{ boxShadow: "inset 3px 0 0 var(--color-warn)" }}
            data-testid="verify-banner"
          >
            <AppText variant="caption" className="block">
              {t("verify.banner", { email: user.email })}
            </AppText>
            <div className="mt-[var(--spacing-sm)]">
              <Button
                title={t("verify.resend")}
                variant="secondary"
                fullWidth={false}
                disabled={busy}
                testId="btn-verify-resend"
                onPress={() =>
                  void run(async () => {
                    const r = await authClient().sendEmailVerification({});
                    return r.retryAfterSec > 0
                      ? t("verify.wait", { sec: r.retryAfterSec })
                      : t("verify.resent");
                  })
                }
              />
            </div>
          </div>
        )
      ) : null}

      {/* ② 비밀번호 */}
      <div className="mt-[var(--spacing-md)]">
        <AppText variant="caption" className="block font-semibold">
          {user.hasPassword ? t("security.changePassword") : t("security.setPassword")}
        </AppText>
        {/* [원본] {!user.hasPassword ? (
          <AppText variant="caption" color="textMuted" className="block">
            {t("security.setPasswordCaption")}
          </AppText>
        ) : null} */}
        {/* [개선] 설명 줄 없앰(SPEC-055 Phase 4) */}
        {user.hasPassword ? (
          <TextField
            testId="pw-current"
            label={t("security.current")}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        ) : null}
        <TextField
          testId="pw-new"
          label={t("security.new")}
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <Button
          title={t("security.save")}
          variant="secondary"
          fullWidth={false}
          disabled={busy || next.length < 8}
          testId="btn-pw-save"
          onPress={() =>
            void run(async () => {
              const r = await authClient().changePassword({ currentPassword: current, newPassword: next });
              // 다른 기기는 끊겼다 — 이 기기는 새 토큰으로 이어 간다.
              if (r.tokens) setTokens(r.tokens);
              setCurrent("");
              setNext("");
              await refreshMe();
              return t("security.saved");
            })
          }
        />
      </div>

      {needReauth && !user.hasPassword ? (
        <div className="mt-[var(--spacing-sm)] flex flex-col gap-[var(--spacing-xs)]" data-testid="pw-reauth">
          {identities.map((i) => (
            <Button
              key={i.provider}
              title={t("accountDelete.reauthButton", { provider: providerLabel(i.provider) })}
              variant="secondary"
              fullWidth={false}
              testId={`btn-pw-reauth-${i.provider}`}
              onPress={() => {
                const to = startUrl(i.provider, { returnTo: "/account" });
                void appSignIn(to).then((app) => {
                  if (!app) window.location.href = to;
                });
              }}
            />
          ))}
        </div>
      ) : null}

      {/* ③ 연결된 소셜 로그인 */}
      {providers.length ? (
        <div className="mt-[var(--spacing-md)]" data-testid="identities">
          <AppText variant="caption" className="block font-semibold">
            {t("security.identities")}
          </AppText>
          {providers.map((p) =>
            linked.has(p) ? (
              <div
                key={p}
                className="mt-[var(--spacing-xs)] flex items-center justify-between"
                data-testid={`identity-${p}`}
              >
                <AppText variant="caption">
                  {providerLabel(p)} · {identities.find((i) => i.provider === p)?.email || ""}
                </AppText>
                <button
                  type="button"
                  // [원본] className="text-sm text-(--color-ink2)" · [개선] 누르는 자리 44px(SPEC-056 F7)
                  className="min-h-[44px] px-[var(--spacing-xs)] text-sm text-(--color-ink2)"
                  disabled={busy}
                  data-testid={`btn-unlink-${p}`}
                  onClick={() =>
                    void run(async () => {
                      await authClient().unlinkIdentity({ provider: p });
                      load();
                      return t("security.unlink");
                    })
                  }
                >
                  {t("security.unlink")}
                </button>
              </div>
            ) : (
              <div key={p} className="mt-[var(--spacing-xs)]">
                <Button
                  title={t("security.link", { provider: providerLabel(p) })}
                  variant="secondary"
                  fullWidth={false}
                  disabled={busy}
                  testId={`btn-link-${p}`}
                  onPress={() =>
                    void run(async () => {
                      // 전면 이동이라 Authorization 헤더를 실을 수 없다 — 2분짜리 표를 받아 들고 나간다.
                      const r = await authClient().createLinkTicket({});
                      // [원본] window.location.href = startUrl(p, { link: r.ticket, returnTo: "/account" });
                      // [개선] @plm SRS-095  앱이면 시스템 인증 창으로(연결 표가 URL 에 실려 있어 그 창에서도 누가 연결하는지 안다)
                      const to = startUrl(p, { link: r.ticket, returnTo: "/account" });
                      if (!(await appSignIn(to))) window.location.href = to;
                      return "";
                    })
                  }
                />
              </div>
            ),
          )}
        </div>
      ) : null}

      {msg?.text ? (
        <AppText
          variant="caption"
          color={msg.bad ? "danger" : "textMuted"}
          className="mt-[var(--spacing-sm)] block"
          data-testid="security-status"
        >
          {msg.text}
        </AppText>
      ) : null}
    </Card>
  );
}
