"use client";
// @plm SRS-052  비밀번호 재설정 화면 — 성공하면 모든 기기에서 로그아웃된다(서버가 세션을 끊는다)
import { useState } from "react";
import { t } from "@/lib/i18n";
import { authClient, clearTokens } from "@/lib/session";
import { AuthPage } from "../components/auth/AuthPage";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/inputs";
import { AppText } from "../components/ui/primitives";

export default function ResetClient({ token }: { token: string }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [bad, setBad] = useState(!token);

  const submit = async () => {
    setBusy(true);
    try {
      await authClient().resetPassword({ token, newPassword: pw });
      // 이 기기의 세션도 이미 서버에서 끊겼다 — 표시도 맞춘다.
      clearTokens();
      setDone(true);
    } catch {
      setBad(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthPage title={t("reset.title")}>
      {done ? (
        <>
          <AppText variant="body" className="block" data-testid="reset-done">
            {t("reset.done")}
          </AppText>
          <a href="/account" className="mt-[var(--spacing-md)] block font-semibold text-(--color-brand)">
            {t("complete.back")}
          </a>
        </>
      ) : bad ? (
        <>
          <AppText variant="body" color="danger" className="block" data-testid="reset-invalid">
            {t("reset.invalid")}
          </AppText>
          <a href="/forgot" className="mt-[var(--spacing-md)] block font-semibold text-(--color-brand)">
            {t("forgot.title")}
          </a>
        </>
      ) : (
        <>
          <TextField
            testId="reset-password"
            label={t("reset.newPassword")}
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <Button
            title={t("reset.submit")}
            loading={busy}
            disabled={busy || pw.length < 8}
            testId="btn-reset-submit"
            onPress={() => void submit()}
          />
        </>
      )}
    </AuthPage>
  );
}
