"use client";
// @plm SRS-095  계정 삭제 — 구글 플레이·App Store(5.1.1(v)) 필수. 즉시 · 되돌릴 수 없다.
//
// 실수로 지우지 않게 두 겹: 「삭제」를 직접 치고(서버도 같은 문구를 본다), 비밀번호가 있는 계정은 비밀번호를 다시 넣는다.
// 성공하면 AuthProvider.deleteAccount 가 이 기기 기록·대기열·네이티브 사본까지 비우고 로그아웃한다.
import { ConnectError } from "@connectrpc/connect";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { useAuth } from "../AuthProvider";
import { Button } from "../ui/Button";
import { TextField } from "../ui/inputs";
import { AppText, Card } from "../ui/primitives";

const CONFIRM_WORD = "삭제"; // backend auth.DeleteConfirmWord

export function DeleteAccountCard() {
  const { user, deleteAccount } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!user) return null;
  const ready = confirm.trim() === CONFIRM_WORD && (!user.hasPassword || password.length > 0);

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
            .catch((e) => setMsg(e instanceof ConnectError ? e.rawMessage : String(e)))
            .finally(() => setBusy(false));
        }}
      />
      {msg ? (
        <AppText variant="caption" color="danger" className="mt-[var(--spacing-xs)] block" role="alert">
          {msg}
        </AppText>
      ) : null}
    </Card>
  );
}
