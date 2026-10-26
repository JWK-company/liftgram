// @plm SRS-053  백업 파일 — core/sync/backup.ts 를 브라우저 파일(내려받기·고르기)에 잇는다
import { exportBackup, importBackup, type ImportReport } from "@app/core/sync/backup";
import { scheduleSync } from "@app/core/sync/syncEngine";
import { getPref } from "./prefs";
import { flushLocalDb } from "./localDb";

/** 이 기기의 기록을 파일로 내려받는다. 내보낸 기록 수를 돌려준다. */
export async function downloadBackup(): Promise<number> {
  const file = await exportBackup(getPref("sync_owner_id"));
  const count = Object.values(file.tables).reduce((n, rows) => n + rows.length, 0);
  const blob = new Blob([JSON.stringify(file)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `liftgram-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return count;
}

/** 고른 파일을 이 기기에 합친다(지우지 않는다). 디스크에 내려쓰고 동기를 예약한다. */
export async function importBackupFile(file: File): Promise<ImportReport> {
  const json = JSON.parse(await file.text()) as unknown;
  const report = await importBackup(json);
  await flushLocalDb();
  scheduleSync(0);
  return report;
}
