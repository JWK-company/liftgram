"use client";
// @plm SRS-052  비밀번호 찾기 화면
//
// 응답은 **언제나 같다**("보냈어요") — 가입 여부를 드러내지 않는다. 소셜로만 가입한 주소면 서버가
// 어느 제공자로 가입했는지 메일로만 알린다. 로그인 없이 메일을 내보내는 입구라 사람 확인을 거친다.
import { ConnectError } from "@connectrpc/connect";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { authClient } from "@/lib/session";
import { HUMAN_HEADER } from "../components/AuthProvider";
import { AuthPage } from "../components/auth/AuthPage";
import { HumanCheck } from "../components/auth/HumanCheck";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/inputs";
import { AppText } from "../components/ui/primitives";

export default function ForgotClient({ siteKey }: { siteKey: string }) {
  const [email, setEmail] = useState("");
  const [human, setHuman] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await authClient().requestPasswordReset(
        { email: email.trim() },
        { headers: human ? { [HUMAN_HEADER]: human } : {} },
      );
      setMsg({ text: t("forgot.sent") });
    } catch (e) {
      const raw = e instanceof ConnectError ? e.rawMessage : "";
      setMsg({
        text: raw.includes("보안 확인")
          ? t("auth.errHumanCheck")
          : raw.includes("너무 잦")
            ? t("auth.errRate")
            : t("auth.errServer"),
        bad: true,
      });
      setReset((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthPage title={t("forgot.title")}>
      <AppText variant="caption" color="textMuted" className="block">
        {t("forgot.caption")}
      </AppText>
      <TextField
        testId="forgot-email"
        label={t("auth.emailLabel")}
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <HumanCheck siteKey={siteKey} onToken={setHuman} resetKey={reset} />
      <Button
        title={t("forgot.submit")}
        loading={busy}
        disabled={busy || !email.includes("@")}
        testId="btn-forgot-submit"
        onPress={() => void submit()}
      />
      {msg ? (
        <AppText
          variant="caption"
          color={msg.bad ? "danger" : "textMuted"}
          className="mt-[var(--spacing-sm)] block"
          data-testid="forgot-status"
        >
          {msg.text}
        </AppText>
      ) : null}
    </AuthPage>
  );
}
