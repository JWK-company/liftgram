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
import { AuthFooter } from "../auth/AuthPage";
import { SubAppBar } from "../ui/AppBar";
import { SectionLabel } from "../ui/rows";
import { Logo } from "../ui/Logo";
import { HumanCheck } from "../auth/HumanCheck";
import { SecurityCard, useIdentities } from "../auth/SecurityCard";
import { providerLabel } from "../auth/providers";
import type { LastLogin } from "@/lib/last-login";
import { LastLoginBadge, SocialButtons, useAuthOptions } from "../auth/SocialButtons";
import { agoText, useSyncHealth } from "../sync/useSyncHealth";
import { t, type TransKey } from "@/lib/i18n";
import { useAuth } from "../AuthProvider";
import { RouteLoading } from "../ui/LogoSpinner";
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
  lastLogin = null,
  deviceData = false,
}: {
  siteKey?: string;
  oauthError?: string;
  /** /signup 으로 들어오면 가입 화면부터 */
  initialMode?: Mode;
  /** 키가 아직 없어 눌러도 나가지 않는 제공자 — "설정 필요"로 미리 보여 준다(OAUTH_PREVIEW_PROVIDERS) */
  preview?: string[];
  /** 이 기기에서 마지막으로 로그인한 방법 — 서버 페이지가 HttpOnly 쿠키 lg_last 를 읽어 넘긴다. */
  lastLogin?: LastLogin | null;
  /** /account 에서만 — 로그인하지 않은 기기의 백업 파일·오프라인 안내를 함께 보인다(로그인 화면에는 없다 · 시안 10). */
  deviceData?: boolean;
}) {
  const { user, restoring, signUp, logIn, logOut } = useAuth();
  const [human, setHuman] = useState<string | null>(null);
  const [humanReset, setHumanReset] = useState(0);
  const { mailEnabled } = useAuthOptions();
  const oauthMsg = OAUTH_ERRS.has(oauthError) ? t(`oauth.err.${oauthError}` as TransKey) : null;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [identities] = useIdentities(user?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "signup";

  // 로그아웃하면 로그인부터 다시 보인다 — 가입 화면에 남아 있으면 「로그인」 으로 돌아갈 탭이 이제 없다(시안 10).
  const [wasUser, setWasUser] = useState(!!user);
  if (wasUser !== !!user) {
    setWasUser(!!user);
    if (!user && mode !== initialMode) setMode(initialMode);
  }

  // 이미 로그인돼 있으면 로그인 폼 대신 지금 누구인지 보여 준다.
  // 계정에 주소가 없으면(보증하지 않는 제공자 — 네이버로만 가입) 연결된 로그인의 주소를 대신 보인다.
  const viaIdentity = identities.find((i) => i.email);
  const accountLine =
    user?.email || (viaIdentity ? `${providerLabel(viaIdentity.provider)} · ${viaIdentity.email}` : "");
  if (user) {
    // 계정 화면(/account) — 프로필의 하위 화면이다(시안 09·29개 표): ← · 「계정」 · 세 구역
    // ① 계정(이름·주소·로그아웃 · 프로필 편집) ② 로그인·보안 ③ 기기와 서버(동기 · 백업 파일).
    return (
      <div className="flex flex-1 flex-col">
        <SubAppBar title={t("profile.account")} fallbackHref="/profile" />
        <div className="flex flex-1 flex-col px-[var(--spacing-lg)] pt-[var(--spacing-lg)] pb-[var(--spacing-xl)]">
          <SectionLabel title={t("profile.account")} />
          <Card className="mb-[var(--spacing-md)]">
            <AppText variant="heading" className="block truncate" data-testid="auth-email">
              {user.displayName || user.email}
            </AppText>
            {user.displayName && accountLine ? (
              <AppText
                variant="caption"
                color="textMuted"
                className="mt-[2px] block truncate"
                data-testid="auth-account-line"
              >
                {accountLine}
              </AppText>
            ) : null}
            <div className="mt-[var(--spacing-md)]">
              <Button
                title={t("profile.signOut")}
                // [원본] variant="danger" — 빨강 테두리·글자. 로그아웃은 데이터를 지우지 않는 일상 행동이다(화면 정리 P4)
                // [개선] 회색 상자 버튼 @plm SRS-072
                variant="secondary"
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
          <SectionLabel title="기기와 서버" className="mt-[var(--spacing-sm)]" />
          <ServerSyncCard />
          <div id="backup">
            <BackupCard />
          </div>
          <OfflineNote />
        </div>
      </div>
    );
  }
  // 세션 깃발은 있는데 아직 확인 중이다 — 로그인 폼을 그리지 않는다(로그인한 사람에게 폼이 깜빡이던 것 · SRS-054).
  if (restoring) return <RouteLoading />;

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
    <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-[var(--spacing-lg)] pt-[var(--spacing-xl)] pb-[var(--spacing-xl)]">
      {/* 시안 10: 탭바 없는 전체 화면 · 로고 · 한 줄 머리말 · 소셜 3종 → 또는 이메일 → 아래 한 줄 링크.
          로그인/가입 탭은 없앴다 — 두 화면은 아래 링크로 오간다(북타래와 같은 형태). */}
      <Header title={t(isSignup ? "auth.signup" : "auth.login")} />

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

      <SocialButtons returnTo="/account" preview={preview} last={lastLogin} />
      {isSignup ? (
        <AppText variant="caption" color="textMuted" className="mb-[var(--spacing-md)] block">
          {t("auth.signupEmailNote")}
        </AppText>
      ) : null}

      <div className="mb-[var(--spacing-lg)]">
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
            adornment={!isSignup && lastLogin === "email" ? <LastLoginBadge /> : null}
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
            data-testid={isSignup ? "mode-login" : "mode-signup"}
          >
            {isSignup ? t("auth.login") : t("auth.signup")}
          </button>
        </p>
      </div>

      {/* 계정 화면에서만: 로그인하지 않은 이 기기의 기록을 파일로 꺼내거나 되살린다. 로그인 화면엔 두지 않는다. */}
      {deviceData ? (
        <div id="backup" className="mt-[var(--spacing-sm)]">
          <BackupCard />
          <OfflineNote />
        </div>
      ) : (
        <OfflineNote />
      )}
      <AuthFooter />
    </div>
  );
}

function Header({ title }: { title: string }) {
  return (
    <div className="mb-[var(--spacing-xl)]">
      {/* 로고 — 2026-10-26 확정(B1 · 주황). 워드마크는 글자색을 따라 다크에서 저절로 밝아진다. */}
      <a href="/" aria-label="Liftgram 홈" className="inline-block">
        <Logo height={26} className="text-(--color-ink)" />
      </a>
      <h1
        data-testid="auth-title"
        className="mt-[var(--spacing-xl)] font-bold text-(--color-ink) text-[length:var(--text-xl)]"
      >
        {title}
      </h1>
      <AppText variant="body" color="textMuted" className="mt-[var(--spacing-xs)] block">
        로그인하면 기록이 서버에 백업되고 피드를 쓸 수 있어요
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
