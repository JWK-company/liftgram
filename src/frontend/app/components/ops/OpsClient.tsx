"use client";
// @plm SRS-088  운영 상태 화면(/ops · admin) — 동기가 멈춘 사용자 · 백업 · 사용자 목록
// @plm SRS-087  백업: 마지막 일일 백업(시각·크기·남은 디스크) · 마지막 복원 시험(시각·결과)
//
// 맨 위 한 줄이 판단이다: 문제 없으면 「이상 없음」(회색), 있으면 이유 목록(빨강 **글자** — 채움 아님 · 화면 정리 규칙).
// 그 아래 「동기가 멈춘 사용자」 · 「연락 끊긴 기기」(있을 때만 · 회색) · 「백업」 · 「사용자」(접기) 순. 이메일은 앞부분만, 오류는 앞부분만 싣는다(서버가 자른다).
// admin 판정은 서버가 한다(DB 역할 재확인) — 이 화면은 거절 이유를 그대로 보여 줄 뿐이다.
import { Code, ConnectError } from "@connectrpc/connect";
import type { BackupRun, DeviceHealth, GetOpsStatusResponse } from "@app/contracts";
import { timestampDate, type Timestamp } from "@bufbuild/protobuf/wkt";
import { useCallback, useEffect, useState } from "react";
import { t, type TransKey } from "@/lib/i18n";
import { opsClient } from "@/lib/opsClient";
import { setOpsAlertFromStatus } from "@/lib/opsAlert";
import { useAuth } from "../AuthProvider";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { AppText, Card } from "../ui/primitives";
import { SectionLabel } from "../ui/rows";
import { ScreenHeader } from "../ui/ScreenHeader";

const REASON_KEY: Record<string, TransKey> = {
  stalled: "ops.reason.stalled",
  daily_none: "ops.reason.daily_none",
  daily_stale: "ops.reason.daily_stale",
  restore_none: "ops.reason.restore_none",
  restore_old: "ops.reason.restore_old",
  restore_failed: "ops.reason.restore_failed",
  low_disk: "ops.reason.low_disk",
};

function reasonText(code: string, stalledCount: number): string {
  const key = REASON_KEY[code];
  return key ? t(key, { count: stalledCount }) : t("ops.reason.unknown", { code });
}

function when(ts: Timestamp | undefined): string {
  if (!ts) return t("ops.never");
  const d = timestampDate(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function bytes(n: bigint | number): string {
  const v = Number(n);
  if (!v) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let x = v;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x >= 10 || i === 0 ? Math.round(x) : x.toFixed(1)}${units[i]}`;
}

function DeviceLine({ d }: { d: DeviceHealth }) {
  const parts = [
    d.appVersion ? `v${d.appVersion}` : null,
    d.consecutiveFailures > 0 ? t("ops.failures", { n: d.consecutiveFailures }) : null,
    d.pending > 0 ? t("ops.pending", { n: d.pending }) : null,
    d.blocked ? t("ops.blocked") : null,
  ].filter(Boolean);
  return (
    <AppText variant="caption" color="textMuted" className="block">
      {parts.join(" · ")}
    </AppText>
  );
}

function BackupRow({
  label,
  run,
  extra,
  testId,
}: {
  label: string;
  run?: BackupRun;
  extra?: string;
  testId: string;
}) {
  return (
    <div className="flex flex-col py-[var(--spacing-sm)]" data-testid={testId}>
      <AppText variant="body" className="font-medium">
        {label}
      </AppText>
      {run ? (
        <>
          <AppText variant="caption" color={run.ok ? "textMuted" : "danger"} className="block">
            {`${when(run.createdAt)} · ${run.ok ? t("ops.ok") : t("ops.failed")}`}
            {run.kind === "daily" && run.sizeBytes
              ? ` · ${t("ops.size", { size: bytes(run.sizeBytes) })}`
              : ""}
            {run.diskFreeBytes ? ` · ${t("ops.free", { size: bytes(run.diskFreeBytes) })}` : ""}
          </AppText>
          {run.detail ? (
            <AppText variant="caption" color="textFaint" className="block break-words">
              {run.detail}
            </AppText>
          ) : null}
        </>
      ) : (
        <AppText variant="caption" color="danger" className="block">
          {t("ops.none")}
        </AppText>
      )}
      {extra ? (
        <AppText variant="caption" color="textFaint" className="block">
          {extra}
        </AppText>
      ) : null}
    </div>
  );
}

export default function OpsClient() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<GetOpsStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usersOpen, setUsersOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await opsClient().getOpsStatus({});
      setData(res);
      setOpsAlertFromStatus(res.alert, res.alertReasons.length);
    } catch (e) {
      setData(null);
      setError(
        e instanceof ConnectError && e.code === Code.PermissionDenied
          ? t("ops.adminOnly")
          : t("ops.loadFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // 신원이 확정된 뒤에 부른다(moderation 과 같은 이유 — 새로고침 직후 익명 요청이 거절당하지 않게).
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      setError(t("ops.adminOnly"));
      return;
    }
    void load();
  }, [authLoading, user, load]);

  const stalledCount = data?.stalled.length ?? 0;

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("ops.title")}
        back={
          <a href="/profile" aria-label={t("profile.title")} data-testid="ops-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
      />
      <div className="flex-1 p-[var(--spacing-lg)] pt-[var(--spacing-md)]" data-testid="ops-screen">
        {error ? (
          <div className="py-[var(--spacing-xl)] text-center" data-testid="ops-error">
            <AppText variant="body" color="danger">
              {error}
            </AppText>
          </div>
        ) : !data ? (
          <div className="py-[var(--spacing-xl)] text-center" data-testid="ops-loading">
            <AppText variant="caption" color="textMuted">
              {loading ? "…" : t("ops.loadFailed")}
            </AppText>
          </div>
        ) : (
          <>
            {/* 상태 한 줄 — 회색(이상 없음) 또는 빨강 글자 이유 목록(채움 아님) */}
            <div
              className="mb-[var(--spacing-lg)]"
              data-testid="ops-summary"
              data-alert={data.alert ? "1" : "0"}
            >
              {data.alert ? (
                <ul className="flex flex-col gap-[2px]">
                  {data.alertReasons.map((r) => (
                    <li key={r} data-testid="ops-reason" data-reason={r}>
                      <AppText variant="body" color="danger" className="font-medium">
                        {reasonText(r, stalledCount)}
                      </AppText>
                    </li>
                  ))}
                </ul>
              ) : (
                <AppText variant="body" color="textMuted" data-testid="ops-all-clear">
                  {t("ops.allClear")}
                </AppText>
              )}
            </div>

            <SectionLabel title={t("ops.stalledTitle")} />
            <Card className="mb-[var(--spacing-xl)]" data-testid="ops-stalled">
              {data.stalled.length === 0 ? (
                <AppText variant="caption" color="textMuted">
                  {t("ops.stalledEmpty")}
                </AppText>
              ) : (
                data.stalled.map((s) => (
                  <div
                    key={`${s.userId}:${s.device?.deviceId ?? ""}`}
                    className="border-(--color-line) border-b py-[var(--spacing-sm)] last:border-b-0"
                    data-testid="ops-stalled-item"
                    data-user={s.userId}
                  >
                    <div className="flex items-baseline gap-[var(--spacing-sm)]">
                      <AppText variant="body" className="min-w-0 flex-1 truncate font-medium">
                        {[s.emailHint, s.displayName].filter(Boolean).join(" · ") || s.userId}
                      </AppText>
                      <AppText variant="caption" color="danger" className="shrink-0">
                        {t("ops.days", { n: s.days })}
                      </AppText>
                    </div>
                    {s.device ? <DeviceLine d={s.device} /> : null}
                    {s.device?.lastError ? (
                      <AppText variant="caption" color="textFaint" className="block truncate">
                        {s.device.lastError}
                      </AppText>
                    ) : null}
                  </div>
                ))
              )}
            </Card>

            {/* 연락 끊긴 기기 — 회색 · 경보 아님(qa code H-1). 없으면 칸째 숨긴다(빈 칸이 판단을 흐리지 않게). */}
            {data.disconnected.length > 0 ? (
              <>
                <SectionLabel title={t("ops.disconnectedTitle")} />
                <Card className="mb-[var(--spacing-xl)]" data-testid="ops-disconnected">
                  <AppText variant="caption" color="textFaint" className="mb-[var(--spacing-xs)] block">
                    {t("ops.disconnectedNote")}
                  </AppText>
                  {data.disconnected.map((s) => (
                    <div
                      key={`${s.userId}:${s.device?.deviceId ?? ""}`}
                      className="border-(--color-line) border-b py-[var(--spacing-sm)] last:border-b-0"
                      data-testid="ops-disconnected-item"
                      data-user={s.userId}
                    >
                      <div className="flex items-baseline gap-[var(--spacing-sm)]">
                        <AppText variant="body" color="textMuted" className="min-w-0 flex-1 truncate">
                          {[s.emailHint, s.displayName].filter(Boolean).join(" · ") || s.userId}
                        </AppText>
                        <AppText variant="caption" color="textMuted" className="shrink-0">
                          {t("ops.lastReport", { time: when(s.device?.reportedAt) })}
                        </AppText>
                      </div>
                      {s.device ? <DeviceLine d={s.device} /> : null}
                    </div>
                  ))}
                </Card>
              </>
            ) : null}

            <SectionLabel title={t("ops.backupTitle")} />
            <Card className="mb-[var(--spacing-xl)]" data-testid="ops-backup">
              <BackupRow
                label={t("ops.daily")}
                run={data.backup?.lastDaily}
                testId="ops-backup-daily"
                extra={
                  data.backup?.lastDaily && !data.backup.lastDaily.ok
                    ? t("ops.lastOkDaily", { time: when(data.backup.lastOkDailyAt) })
                    : undefined
                }
              />
              <BackupRow
                label={t("ops.restoreTest")}
                run={data.backup?.lastRestoreTest}
                testId="ops-backup-restore"
              />
            </Card>

            <button
              type="button"
              data-testid="ops-users-toggle"
              aria-expanded={usersOpen}
              onClick={() => setUsersOpen((v) => !v)}
              className="flex min-h-[44px] w-full items-center justify-between"
            >
              <AppText variant="label" color="textMuted">
                {t("ops.usersTitle", { count: data.users.length })}
              </AppText>
              <Icon name={usersOpen ? "chevron-up" : "chevron-down"} size={18} color="var(--color-ink3)" />
            </button>
            {usersOpen ? (
              <Card className="mb-[var(--spacing-xl)]" data-testid="ops-users">
                {data.users.map((u) => (
                  <div
                    key={u.userId}
                    className="border-(--color-line) border-b py-[var(--spacing-sm)] last:border-b-0"
                    data-testid="ops-user"
                  >
                    <AppText variant="body" className="block truncate font-medium">
                      {[u.emailHint, u.displayName].filter(Boolean).join(" · ") || u.userId}
                    </AppText>
                    <AppText variant="caption" color="textMuted" className="block">
                      {[
                        t("ops.lastSync", { time: when(u.lastSyncAt) }),
                        t("ops.lastActive", { time: when(u.lastActiveAt) }),
                        t("ops.devices", { n: u.devices.length }),
                      ].join(" · ")}
                    </AppText>
                  </div>
                ))}
              </Card>
            ) : null}
          </>
        )}

        <div className="mt-[var(--spacing-lg)]">
          <Button
            title={t("ops.refresh")}
            variant="secondary"
            size="sm"
            loading={loading}
            disabled={loading || !user}
            onPress={() => void load()}
            testId="ops-refresh"
          />
        </div>
      </div>
    </div>
  );
}
