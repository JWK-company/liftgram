"use client";
// @plm SRS-006  백업 파일 카드 — 이 기기의 기록을 파일로 꺼내고, 파일에서 되살린다
//
// 로그인 여부와 무관하게 늘 있다. 서버 동기가 실패해도 기록을 지킬 수 있는 마지막 길이다.
// 옛 Liftgram 복구 페이지가 만든 파일도 그대로 가져올 수 있다(core/sync/backup.ts).
import { useRef, useState } from "react";
import { downloadBackup, importBackupFile } from "@/lib/backupFile";
import { t } from "@/lib/i18n";
import { Button } from "../ui/Button";
import { AppText, Card } from "../ui/primitives";

export function BackupCard() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  const doExport = async () => {
    setBusy(true);
    try {
      const n = await downloadBackup();
      setMsg({ text: t("backup.exported", { count: n }) });
    } catch (e) {
      setMsg({ text: t("backup.importFailed", { reason: String(e) }), bad: true });
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (file: File) => {
    setBusy(true);
    try {
      const r = await importBackupFile(file);
      setMsg({
        text:
          r.created + r.updated === 0
            ? t("backup.importNothing")
            : t("backup.importDone", { created: r.created, updated: r.updated }),
      });
    } catch (e) {
      setMsg({
        text: t("backup.importFailed", { reason: e instanceof Error ? e.message : String(e) }),
        bad: true,
      });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <Card className="mb-[var(--spacing-lg)]" data-testid="backup-card">
      <AppText variant="label" color="textMuted">
        {t("backup.title")}
      </AppText>
      <AppText variant="caption" color="textMuted" className="mt-[2px] block">
        {t("backup.caption")}
      </AppText>
      <div className="mt-[var(--spacing-md)] flex gap-[var(--spacing-sm)]">
        <Button
          title={t("backup.export")}
          variant="secondary"
          icon="download-outline"
          loading={busy}
          onPress={doExport}
          testId="btn-backup-export"
        />
        <Button
          title={t("backup.import")}
          variant="secondary"
          icon="cloud-download-outline"
          disabled={busy}
          onPress={() => input.current?.click()}
          testId="btn-backup-import"
        />
      </div>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        data-testid="backup-file-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void doImport(f);
        }}
      />
      {msg ? (
        <AppText
          variant="caption"
          color={msg.bad ? "danger" : "textMuted"}
          className="mt-[var(--spacing-sm)] block"
          data-testid="backup-status"
        >
          {msg.text}
        </AppText>
      ) : null}
    </Card>
  );
}
