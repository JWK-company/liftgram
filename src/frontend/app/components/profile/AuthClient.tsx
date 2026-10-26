"use client";
// @plm SRS-006  로그인·가입 — app의 features/profile/AuthScreen.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 화면은 **하지 않아도 되는 일**을 안내한다. 기록은 계정 없이도 기기에 남고,
// 로그인은 서버 백업과 소셜 기능을 여는 것뿐이다 — 맨 아래 안내가 그 말을 한다.
//
// 오류 문구는 서버의 원문을 그대로 띄우지 않는다. Connect 코드를 app이 쓰던 문구로 옮긴다
// (`auth.errInvalid` 등) — 사용자가 읽을 말과 서버가 남길 말은 다르다.
// ─────────────────────────────────────────────────────────────────────────────
import { Code, ConnectError } from "@connectrpc/connect";
import { useState } from "react";
import { syncNow } from "@/lib/syncTransport";
import { ProfileEditCard } from "./ProfileEditCard";
import { BackupCard } from "../sync/BackupCard";
import { HumanCheck } from "../auth/HumanCheck";
import { SecurityCard } from "../auth/SecurityCard";
import { SocialButtons, useAuthOptions } from "../auth/SocialButtons";
import { agoText, useSyncHealth } from "../sync/useSyncHealth";
import { t, type TransKey } from "@/lib/i18n";
import { useAuth } from "../AuthProvider";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/inputs";
import { AppText, Card } from "../ui/primitives";

/**
 * 서버 동기 카드 — app의 features/profile/ServerSyncCard.tsx에서 **동기 부분만** 옮겼다.
 *
 * 로그인·프로필 편집은 이 화면의 다른 곳에 이미 있으므로 겹치지 않는다.
 *
 * 자동 동기가 이미 네 자리에서 돈다(로그인·앱 열기·탭 복귀·온라인 복귀 + 저장 뒤 예약).
 * 그래도 버튼을 두는 이유는 **기다리는 사람에게 지금 상태를 보여 주기 위해서**다 —
 * 배경 동기는 조용히 실패하므로(그게 옳다), 사용자가 확인할 방법이 하나는 있어야 한다.
 */
function ServerSyncCard() {
  const h = useSyncHealth();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const run = () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    setStatus(t("serverSync.syncing"));
    void syncNow()
      .then(() => setStatus(t("serverSync.done")))
      .catch(() => {
        // 사람이 누른 동기는 **실패를 보여 준다**. 배경 동기와 다른 점이 이것뿐이다.
        setStatus(t("auth.errNetwork"));
        setFailed(true);
      })
      .finally(() => setBusy(false));
  };

  return (
    <Card className="mb-[var(--spacing-lg)]" data-testid="sync-card">
      <AppText variant="label" color="textMuted">
        {t("serverSync.title")}
      </AppText>
      <AppText variant="caption" color="textMuted" className="mt-[2px] block">
        {t("serverSync.connectedCaption")}
      </AppText>
      {/* 마지막 백업·남은 기록 — 동기가 조용히 실패해도 여기서는 보인다(2026-10-26). */}
      <AppText
        variant="caption"
        color="textMuted"
        className="mt-[var(--spacing-sm)] block"
        data-testid="sync-last"
      >
        {agoText(h.lastSuccessAt)}
      </AppText>
      <AppText
        variant="caption"
        color={h.pending ? "warning" : "textMuted"}
        className="block"
        data-testid="sync-pending"
      >
        {h.pending ? t("syncHealth.pending", { count: h.pending }) : t("syncHealth.allSynced")}
      </AppText>
      <div className="mt-[var(--spacing-md)]">
        <Button
          title={t("serverSync.syncNow")}
          variant="secondary"
          icon="refresh"
          loading={busy}
          onPress={run}
          testId="btn-sync-now"
        />
      </div>
      {status ? (
        <AppText
          variant="caption"
          color={failed ? "danger" : "textMuted"}
          className="mt-[var(--spacing-sm)] block"
          data-testid="sync-status"
        >
          {status}
        </AppText>
      ) : null}
    </Card>
  );
}

// 서버에 보내기 전에 형식만 본다 — 진짜 검증은 서버가 한다.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = "login" | "signup";

/** 소셜 로그인 콜백이 실패하면 ?err=<코드> 로 돌아온다 — 화이트리스트 코드만 문구로 바꾼다. */
const OAUTH_ERRS = new Set([
  "oauth_state",
  "oauth_failed",
  "oauth_provider",
  "oauth_email_taken",
  "oauth_linked_elsewhere",
  "oauth_link_expired",
  "oauth_rate",
  "oauth_internal",
]);

export default function AuthClient({
  siteKey = "",
  oauthError = "",
  initialMode = "login",
  preview = [],
}: {
  siteKey?: string;
  oauthError?: string;
  /** /signup 으로 들어오면 가입 화면부터 */
  initialMode?: Mode;
  /** 키가 아직 없어 눌러도 나가지 않는 제공자 — "설정 필요"로 미리 보여 준다(OAUTH_PREVIEW_PROVIDERS) */
  preview?: string[];
}) {
  const { user, signUp, logIn, logOut } = useAuth();
  const [human, setHuman] = useState<string | null>(null);
  const [humanReset, setHumanReset] = useState(0);
  const { mailEnabled } = useAuthOptions();
  const oauthMsg = OAUTH_ERRS.has(oauthError) ? t(`oauth.err.${oauthError}` as TransKey) : null;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "signup";

  // 이미 로그인돼 있으면 로그인 폼 대신 지금 누구인지 보여 준다.
  if (user) {
    return (
      <div className="flex flex-1 flex-col p-[var(--spacing-lg)]">
        <Header />
        <Card className="mb-[var(--spacing-lg)]">
          <AppText variant="label" color="textMuted">
            {t("profile.account")}
          </AppText>
          <AppText
            variant="heading"
            className="mt-[var(--spacing-xs)] block truncate"
            data-testid="auth-email"
          >
            {user.displayName || user.email}
          </AppText>
          {user.displayName ? (
            <AppText variant="caption" color="textMuted" className="mt-[2px] block truncate">
              {user.email}
            </AppText>
          ) : null}
          <div className="mt-[var(--spacing-md)]">
            <Button
              title={t("profile.signOut")}
              variant="danger"
              icon="exit-outline"
              testId="btn-logout"
              onPress={() => {
                setBusy(true);
                void logOut().finally(() => setBusy(false));
              }}
              loading={busy}
            />
          </div>
        </Card>
        {oauthMsg ? (
          <AppText
            variant="caption"
            color="danger"
            className="mb-[var(--spacing-md)] block"
            data-testid="oauth-error"
          >
            {oauthMsg}
          </AppText>
        ) : null}
        <ProfileEditCard />
        <SecurityCard />
        <ServerSyncCard />
        <BackupCard />
        <OfflineNote />
      </div>
    );
  }

  const submit = () => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError(t("auth.invalidEmail"));
      return;
    }
    if (!password) {
      setError(t("auth.passwordRequired"));
      return;
    }
    setError(null);
    setBusy(true);
    void (async () => {
      try {
        if (isSignup) await signUp(trimmed, password, displayName.trim(), human);
        else await logIn(trimmed, password);
      } catch (e) {
        setError(t(messageKeyFor(e)));
        // 사람 확인 토큰은 한 번 쓰면 끝이다 — 실패했으면 새로 받는다.
        if (isSignup) setHumanReset((n) => n + 1);
      } finally {
        setBusy(false);
      }
    })();
  };

  // booktarae 형식(SRS-052): 로그인·회원가입은 **다른 화면**이다(/signin · /signup — 같은 컴포넌트).
  // 소셜이 1순위로 맨 위, 그 아래 "또는 이메일로". 두 화면 사이는 아래 링크로 오간다.
  const go = (m: Mode) => {
    setMode(m);
    setError(null);
    if (typeof window !== "undefined")
      window.history.replaceState(null, "", m === "signup" ? "/signup" : "/signin");
  };

  return (
    <div className="flex flex-1 flex-col p-[var(--spacing-lg)]">
      <Header />

      {/* 화면 이름 — 두 화면을 오가는 탭을 겸한다(지금 화면이 굵게). */}
      <div className="mb-[var(--spacing-lg)] flex justify-center gap-[var(--spacing-xl)]">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            data-testid={`mode-${m}`}
            aria-current={mode === m ? "page" : undefined}
            onClick={() => go(m)}
            className={`border-b-2 pb-[var(--spacing-xs)] text-lg ${
              mode === m
                ? "border-(--color-brand) font-bold text-(--color-ink)"
                : "border-transparent text-(--color-ink3)"
            }`}
          >
            {t(m === "login" ? "auth.login" : "auth.signup")}
          </button>
        ))}
      </div>

      {oauthMsg ? (
        <AppText
          variant="caption"
          color="danger"
          className="mb-[var(--spacing-md)] block rounded-[var(--radius-md)] border border-(--color-bad) p-[var(--spacing-md)]"
          data-testid="oauth-error"
          role="alert"
        >
          {oauthMsg}
        </AppText>
      ) : null}

      <SocialButtons returnTo="/account" preview={preview} />
      {isSignup ? (
        <AppText variant="caption" color="textMuted" className="mb-[var(--spacing-md)] block">
          {t("auth.signupEmailNote")}
        </AppText>
      ) : null}

      <Card className="mb-[var(--spacing-lg)]">
        <TextField
          testId="auth-email-input"
          label={t("auth.emailLabel")}
          placeholder="you@example.com"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {!isSignup ? (
          <AppText
            variant="caption"
            color="textFaint"
            className="-mt-[var(--spacing-xs)] mb-[var(--spacing-sm)] block"
          >
            {t("auth.idHint")}
          </AppText>
        ) : null}
        <TextField
          testId="auth-password-input"
          label={t("auth.passwordLabel")}
          placeholder={isSignup ? t("auth.passwordHint") : t("auth.passwordLabel")}
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {isSignup ? (
          <>
            <TextField
              testId="auth-name-input"
              label={t("auth.displayNameLabel")}
              placeholder={t("auth.displayNamePlaceholder")}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <AppText
              variant="caption"
              color="textFaint"
              className="-mt-[var(--spacing-xs)] mb-[var(--spacing-sm)] block"
            >
              {t("auth.nicknameHint")}
            </AppText>
          </>
        ) : null}

        {/* 가입은 로그인 없이 메일을 내보내는 입구다 — 사람 확인(키가 없으면 그리지 않는다). */}
        {isSignup ? <HumanCheck siteKey={siteKey} onToken={setHuman} resetKey={humanReset} /> : null}

        {error ? (
          <AppText variant="caption" color="danger" data-testid="auth-error" className="block" role="alert">
            {error}
          </AppText>
        ) : null}

        <div className="mt-[var(--spacing-sm)]">
          <Button
            title={t(isSignup ? "auth.signupSubmit" : "auth.loginWithEmail")}
            loading={busy}
            disabled={busy}
            testId="btn-auth-submit"
            onPress={submit}
          />
        </div>
        {!isSignup && mailEnabled ? (
          <a
            href="/forgot"
            className="mt-[var(--spacing-sm)] flex min-h-11 items-center justify-center text-sm text-(--color-ink) underline"
            data-testid="link-forgot"
          >
            {t("auth.forgotLink")}
          </a>
        ) : null}
        {isSignup ? (
          <p
            className="mt-[var(--spacing-xs)] text-center text-xs text-(--color-ink3)"
            data-testid="signup-legal"
          >
            가입하면{" "}
            <a href="/terms" className="underline">
              이용약관
            </a>
            과{" "}
            <a href="/privacy" className="underline">
              개인정보처리방침
            </a>
            에 동의하는 것으로 봅니다.
          </p>
        ) : null}
        <p className="mt-[var(--spacing-xs)] text-center text-sm text-(--color-ink3)">
          {isSignup ? t("auth.haveAccount") : t("auth.noAccount")}{" "}
          <button
            type="button"
            className="font-semibold text-(--color-ink) underline"
            onClick={() => go(isSignup ? "login" : "signup")}
            data-testid={isSignup ? "link-to-signin" : "link-to-signup"}
          >
            {isSignup ? t("auth.login") : t("auth.signup")}
          </button>
        </p>
      </Card>

      <BackupCard />
      <OfflineNote />
    </div>
  );
}

function Header() {
  return (
    <div className="mt-[var(--spacing-xl)] mb-[var(--spacing-xl)] flex flex-col items-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-lg)] bg-(--color-surface-alt)">
        <Icon name="barbell" size={30} color="var(--color-brand)" />
      </span>
      <AppText variant="caption" color="textMuted" className="mt-[var(--spacing-md)] block">
        {t("auth.tagline")}
      </AppText>
    </div>
  );
}

/** 로그인이 **필수가 아니라는 것**을 말해 주는 자리. 이 앱의 성격 그 자체다. */
function OfflineNote() {
  return (
    <div className="flex items-start rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-surface) p-[var(--spacing-md)]">
      <Icon name="shield-checkmark-outline" size={18} color="var(--color-ink2)" />
      <AppText variant="caption" color="textMuted" className="ml-[var(--spacing-sm)] flex-1">
        {t("auth.offlineNote")}
      </AppText>
    </div>
  );
}

/** 서버 코드를 사용자가 읽을 문구로. app이 쓰던 키를 그대로 쓴다. */
function messageKeyFor(e: unknown): TransKey {
  if (e instanceof ConnectError) {
    switch (e.code) {
      case Code.Unauthenticated:
        return "auth.errInvalid";
      case Code.AlreadyExists:
        return "auth.errExists";
      case Code.DeadlineExceeded:
        return "auth.errTimeout";
      case Code.Unavailable:
        return e.rawMessage.includes("너무 잦") ? "auth.errRate" : "auth.errNetwork";
      case Code.InvalidArgument:
        return e.rawMessage.includes("보안 확인") ? "auth.errHumanCheck" : "auth.invalidEmail";
    }
  }
  return "auth.errServer";
}
