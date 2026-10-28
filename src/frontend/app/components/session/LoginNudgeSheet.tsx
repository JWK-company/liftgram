"use client";
// @plm SRS-086  로그인 권유 시트 — 비로그인 기기에서 운동을 마치면 요약 위에(루틴 질문이 끝난 뒤) 뜬다
//
// 주 행동은 로그인(가입)으로 가는 것 하나 · 「나중에」·바깥 누름 = 닫기. 보인 순간을 기록해 다음 권유 때를 정한다.
// 로그인하면 이 기기 기록이 그 계정으로 올라가는 것은 기존 동작이다(awaitFirstSync · AccountGuard).
import { useEffect } from "react";
import { t } from "@/lib/i18n";
import { navigateAfterFlush } from "@/lib/localDb";
import { markLoginNudgeShown } from "@/lib/loginNudge";
import { Button } from "../ui/Button";
import { SheetShell } from "../ui/Dialog";
import { AppText } from "../ui/primitives";

export function LoginNudgeSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => markLoginNudgeShown(), []);
  return (
    <SheetShell testId="login-nudge" title={t("loginNudge.title")} onClose={onClose} hideOk>
      <AppText variant="body" color="textMuted" className="mt-[var(--spacing-xs)] block">
        {t("loginNudge.body")}
      </AppText>
      <div className="mt-[var(--spacing-md)] flex flex-col gap-[var(--spacing-sm)]">
        <Button
          title={t("loginNudge.login")}
          testId="btn-login-nudge-login"
          onPress={() => {
            onClose();
            void navigateAfterFlush("/account");
          }}
        />
        <Button
          title={t("loginNudge.later")}
          variant="quiet"
          testId="btn-login-nudge-later"
          onPress={onClose}
        />
      </div>
    </SheetShell>
  );
}
