"use client";
// @plm SRS-095  계정 삭제 — 구글 플레이·App Store(5.1.1(v)) 필수. 즉시 · 되돌릴 수 없다.
//
// 실수로 지우지 않게 두 겹: 「삭제」(또는 DELETE)를 직접 치고(서버도 같은 문구를 본다),
//   · 비밀번호가 있는 계정은 비밀번호를 다시 넣는다.
//   · 소셜 전용 계정은 10분 안에 다시 로그인했어야 한다 — 서버가 reauth_required 로 거절하면 연결된 제공자로 다시
//     로그인하는 버튼을 띄우고, 로그인이 끝나면 이 카드로 돌아온다(qa code H-2).
// 성공하면 AuthProvider.deleteAccount 가 이 기기 기록·대기열·네이티브 사본까지 비우고 로그아웃한다.
import { errorText } from "@/lib/errorText";
import { ConnectError } from "@connectrpc/connect";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { appSignIn } from "@/lib/native";
import { useAuth } from "../AuthProvider";
import { Button } from "../ui/Button";
import { TextField } from "../ui/inputs";
import { AppText, Card } from "../ui/primitives";
import { providerLabel, startUrl } from "./providers";
import { useIdentities } from "./SecurityCard";

// backend auth.DeleteConfirmWord · DeleteConfirmWordEN
const CONFIRM_WORDS = ["삭제", "DELETE"];
const REAUTH = "reauth_required"; // backend auth.ErrReauthRequiredMsg
const BACK = "/account#delete-account";

export function DeleteAccountCard() {
  const { user, deleteAccount } = useAuth();
  const [identities] = useIdentities(user?.id);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [needReauth, setNeedReauth] = useState(false);
  if (!user) return null;
  const ready = CONFIRM_WORDS.includes(confirm.trim()) && (!user.hasPassword || password.length > 0);

  const reauth = (p: string) => {
    const to = startUrl(p, { returnTo: BACK });
    void appSignIn(to).then((app) => {
      if (!app) window.location.href = to;
    });
  };

  return (
    <Card className="mt-[var(--spacing-md)]" data-testid="delete-account-card" id="delete-account">
      <AppText variant="body" className="block font-semibold" color="danger">
        {t("accountDelete.title")}
      </AppText>
      <AppText variant="caption" color="textMuted" className="mt-[2px] block">
        {t("accountDelete.caption")}
      </AppText>
      {user.hasPassword ? (
        <TextField
          testId="delete-password"
          label={t("accountDelete.password")}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      ) : null}
      <TextField
        testId="delete-confirm"
        label={t("accountDelete.confirmLabel")}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <Button
        title={t("accountDelete.button")}
        variant="danger"
        fullWidth={false}
        disabled={busy || !ready}
        loading={busy}
        testId="btn-delete-account"
        onPress={() => {
          setBusy(true);
          setMsg(null);
          void deleteAccount(password, confirm)
            .catch((e) => {
              const raw = e instanceof ConnectError ? e.rawMessage : String(e);
              if (raw === REAUTH) setNeedReauth(true);
              else setMsg(errorText(e));
            })
            .finally(() => setBusy(false));
        }}
      />
      {needReauth ? (
        <div
          className="mt-[var(--spacing-sm)] flex flex-col gap-[var(--spacing-xs)]"
          data-testid="delete-reauth"
        >
          <AppText variant="caption" color="textMuted" className="block">
            {t("accountDelete.reauth")}
          </AppText>
          {identities.map((i) => (
            <Button
              key={i.provider}
              title={t("accountDelete.reauthButton", { provider: providerLabel(i.provider) })}
              variant="secondary"
              fullWidth={false}
              testId={`btn-delete-reauth-${i.provider}`}
              onPress={() => reauth(i.provider)}
            />
          ))}
        </div>
      ) : null}
      {msg ? (
        <AppText variant="caption" color="danger" className="mt-[var(--spacing-xs)] block" role="alert">
          {msg}
        </AppText>
      ) : null}
    </Card>
  );
}
