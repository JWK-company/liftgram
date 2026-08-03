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

export default function AuthClient() {
  const { user, signUp, logIn, logOut } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
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
        <ServerSyncCard />
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
        if (isSignup) await signUp(trimmed, password, displayName.trim());
        else await logIn(trimmed, password);
      } catch (e) {
        setError(t(messageKeyFor(e)));
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div className="flex flex-1 flex-col p-[var(--spacing-lg)]">
      <Header />

      <div className="mb-[var(--spacing-lg)] flex gap-[3px] rounded-[var(--radius-md)] bg-(--color-surface-alt) p-[3px]">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            data-testid={`mode-${m}`}
            onClick={() => setMode(m)}
            style={{ backgroundColor: mode === m ? "var(--color-brand)" : "transparent" }}
            className="flex-1 rounded-[var(--radius-sm)] py-[var(--spacing-sm)]"
          >
            <AppText
              variant="caption"
              style={{ color: mode === m ? "var(--color-on-brand)" : "var(--color-ink2)" }}
              className={mode === m ? "font-bold" : "font-semibold"}
            >
              {t(m === "login" ? "auth.login" : "auth.signup")}
            </AppText>
          </button>
        ))}
      </div>

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
        <TextField
          testId="auth-password-input"
          label={t("auth.passwordLabel")}
          placeholder={t("auth.passwordLabel")}
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        {isSignup ? (
          <TextField
            testId="auth-name-input"
            label={t("auth.displayNameLabel")}
            placeholder={t("auth.displayNamePlaceholder")}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        ) : null}

        {error ? (
          <AppText variant="caption" color="danger" data-testid="auth-error" className="block">
            {error}
          </AppText>
        ) : null}

        <div className="mt-[var(--spacing-sm)]">
          <Button
            title={t(isSignup ? "auth.signupButton" : "auth.login")}
            icon="chevron-forward"
            loading={busy}
            disabled={busy}
            testId="btn-auth-submit"
            onPress={submit}
          />
        </div>
      </Card>

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
        return "auth.errNetwork";
      case Code.InvalidArgument:
        return "auth.invalidEmail";
    }
  }
  return "auth.errServer";
}
