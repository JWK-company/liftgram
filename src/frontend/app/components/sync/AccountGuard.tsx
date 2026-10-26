"use client";
// @plm SRS-053  계정 전환 가드 — 다른 계정의 올라가지 않은 기록을 **지우지 않고** 고르게 한다
//
// syncOwner가 멈춰 둔 상태(ownerConflict)를 보여 준다. 고를 수 있는 길은 둘이다:
//   ① 로그아웃 → 원래 계정으로 로그인하면 그 계정에 올라간다
//   ② 백업 파일로 **먼저 내보낸 뒤** 이 기기 기록을 지우고 지금 계정으로 계속
// 닫기(밖 누르기·Esc)는 아무것도 바꾸지 않는다 — 동기는 계속 멈춰 있고 경고 띠가 남는다.
import { useState } from "react";
import { downloadBackup } from "@/lib/backupFile";
import { t } from "@/lib/i18n";
import { useAuth } from "../AuthProvider";
import { Button } from "../ui/Button";
import { Overlay } from "../ui/Dialog";
import { AppText } from "../ui/primitives";

export function AccountGuard() {
  const { ownerConflict, logOut, resolveConflictByDiscard } = useAuth();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!ownerConflict || hidden) return null;

  return (
    <Overlay onClose={() => setHidden(true)} testId="account-guard">
      <AppText variant="heading" className="block">
        {t("accountGuard.title")}
      </AppText>
      <AppText variant="body" color="textMuted" className="mt-[var(--spacing-sm)] block">
        {t("accountGuard.body", { count: ownerConflict.pending })}
      </AppText>
      <AppText variant="caption" color="textMuted" className="mt-[var(--spacing-md)] block">
        {t("accountGuard.optionBack")}
      </AppText>
      <AppText variant="caption" color="textMuted" className="mt-[var(--spacing-xs)] block">
        {t("accountGuard.optionDiscard")}
      </AppText>
      <div className="mt-[var(--spacing-lg)] flex flex-col gap-[var(--spacing-sm)]">
        <Button
          title={t("accountGuard.logOut")}
          variant="primary"
          disabled={busy}
          onPress={() => void logOut()}
          testId="btn-guard-logout"
        />
        <Button
          title={t("accountGuard.exportAndDiscard")}
          variant="danger"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            try {
              // 내보내기가 **끝나야** 지운다 — 파일이 안 만들어졌으면 아무것도 지우지 않는다.
              await downloadBackup();
              await resolveConflictByDiscard();
            } finally {
              setBusy(false);
            }
          }}
          testId="btn-guard-discard"
        />
      </div>
    </Overlay>
  );
}
