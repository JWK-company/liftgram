"use client";

// 운영 상태(관리자). 맨 위 한 줄이 판단이고, 그 아래 표에서 근거를 본다.
// 이메일은 서버가 앞부분만 준다. 연락 끊긴 기기는 경고가 아니라 회색으로만 보인다.
import { type BackupRun, type DeviceHealth, type OpsUser, Role, type StalledDevice } from "@app/contracts";
import { useEffect, useMemo, useState } from "react";
import {
  Button,
  type Column,
  DataTable,
  Empty,
  Loaded,
  PageHeader,
  Pager,
  pageOf,
  RefreshBar,
  SearchInput,
  Section,
  Tag,
} from "@/app/components/ui";
import { RoleGate } from "@/app/components/RoleGate";
import { bytes, kst } from "@/lib/format";
import { useOpsAlert } from "@/lib/opsAlert";
import { reasonText } from "@/lib/opsReasons";
import { opsApi } from "@/lib/rpc";
import { useQueryState } from "@/lib/useQueryState";
import { useResource } from "@/lib/useResource";

const ADMIN_ONLY = [Role.ADMIN] as const;
const USERS_LIMIT = 1000;

function deviceLine(d?: DeviceHealth): string {
  if (!d) return "—";
  return [
    d.appVersion ? `v${d.appVersion}` : null,
    d.consecutiveFailures > 0 ? `연속 실패 ${d.consecutiveFailures}` : null,
    d.pending > 0 ? `안 올라간 기록 ${d.pending}` : null,
    d.blocked ? "다른 계정 기록으로 멈춤" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const who = (s: { emailHint: string; displayName: string; userId: string }) =>
  [s.emailHint, s.displayName].filter(Boolean).join(" · ") || s.userId;

function BackupRow({
  label,
  run,
  extra,
  testid,
}: {
  label: string;
  run?: BackupRun;
  extra?: string;
  testid: string;
}) {
  return (
    <div data-testid={testid} className="py-2">
      <p className="font-medium">{label}</p>
      {run ? (
        <p>
          {run.ok ? <Tag tone="ok">성공</Tag> : <Tag tone="danger">실패</Tag>}{" "}
          <span className="text-muted">
            {kst(run.createdAt)}
            {run.kind === "daily" && run.sizeBytes ? ` · 크기 ${bytes(run.sizeBytes)}` : ""}
            {run.diskFreeBytes ? ` · 남은 디스크 ${bytes(run.diskFreeBytes)}` : ""}
          </span>
        </p>
      ) : (
        <p className="text-danger">기록 없음</p>
      )}
      {run?.detail && <p className="break-words text-muted text-xs">{run.detail}</p>}
      {extra && <p className="text-muted text-xs">{extra}</p>}
    </div>
  );
}

function Screen() {
  const res = useResource(() => opsApi.getOpsStatus({}), 5 * 60_000, "ops-status");
  const { setAlert: setDot } = useOpsAlert();
  const [q, setQ] = useQueryState();
  const search = q.get("user") ?? "";
  const sort = q.get("sort") ?? "sync";

  // 화면이 새 상태를 읽으면 메뉴 점도 같은 값으로 맞춘다.
  const statusAlert = res.data?.alert;
  // 저장해 둔 이전 값으로는 맞추지 않는다. 이 화면에 들어온 뒤 시작한 읽기만 믿는다(SPEC-035).
  const [enteredAt] = useState(() => Date.now());
  const dataStartedAt = res.dataStartedAt ?? 0;
  useEffect(() => {
    if (statusAlert !== undefined && dataStartedAt >= enteredAt) setDot(statusAlert);
  }, [statusAlert, dataStartedAt, enteredAt, setDot]);

  const stalledColumns: Column<StalledDevice>[] = [
    { key: "who", header: "사용자", cell: (s) => <span data-testid="stalled-who">{who(s)}</span> },
    { key: "days", header: "멈춘 기간", cell: (s) => <span className="text-danger">{s.days}일째</span> },
    { key: "device", header: "기기", cell: (s) => deviceLine(s.device) },
    {
      key: "error",
      header: "마지막 오류",
      cell: (s) => <span className="break-all text-muted text-xs">{s.device?.lastError || "—"}</span>,
    },
    {
      key: "report",
      header: "마지막 보고",
      cell: (s) => kst(s.device?.reportedAt),
      className: "whitespace-nowrap",
    },
  ];
  const disconnectedColumns: Column<StalledDevice>[] = [
    { key: "who", header: "사용자", cell: (s) => who(s), className: "text-muted" },
    { key: "device", header: "기기", cell: (s) => deviceLine(s.device), className: "text-muted" },
    {
      key: "report",
      header: "마지막 보고",
      cell: (s) => kst(s.device?.reportedAt),
      className: "whitespace-nowrap text-muted",
    },
  ];
  const userColumns: Column<OpsUser>[] = [
    { key: "who", header: "사용자", cell: (u) => who(u) },
    { key: "sync", header: "마지막 동기", cell: (u) => kst(u.lastSyncAt), className: "whitespace-nowrap" },
    {
      key: "active",
      header: "마지막 활동(토큰 갱신)",
      cell: (u) => kst(u.lastActiveAt),
      className: "whitespace-nowrap",
    },
    { key: "devices", header: "기기", cell: (u) => `${u.devices.length}대` },
  ];

  const data = res.data;
  const users = useMemo(() => {
    const term = search.trim().toLowerCase();
    const seconds = (u: OpsUser) => Number((sort === "active" ? u.lastActiveAt : u.lastSyncAt)?.seconds ?? 0);
    return (data?.users ?? [])
      .filter((u) => !term || who(u).toLowerCase().includes(term))
      .sort((a, b) => seconds(b) - seconds(a));
  }, [data, search, sort]);
  const paged = pageOf(users, Number(q.get("page") ?? 1));

  return (
    <>
      <PageHeader title="운영 상태">
        <RefreshBar resource={res} />
      </PageHeader>
      <Loaded resource={res}>
        {(d) => (
          <>
            <div data-testid="ops-summary" data-alert={d.alert ? "1" : "0"} className="mb-6">
              {d.alert ? (
                <ul className="space-y-0.5">
                  {d.alertReasons.map((r) => (
                    <li key={r} data-testid="ops-reason" data-reason={r} className="font-medium text-danger">
                      {reasonText(r, d.stalled.length)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p data-testid="ops-all-clear" className="text-muted">
                  이상 없음
                </p>
              )}
            </div>

            <Section title="동기가 멈춘 사용자" testid="ops-stalled">
              {d.stalled.length === 0 ? (
                <Empty testid="ops-stalled-empty">멈춘 기기가 없습니다.</Empty>
              ) : (
                <DataTable
                  columns={stalledColumns}
                  rows={d.stalled}
                  rowKey={(s) => `${s.userId}:${s.device?.deviceId ?? ""}`}
                  rowTestid="ops-stalled-item"
                />
              )}
            </Section>

            {d.disconnected.length > 0 && (
              <Section
                title="연락 끊긴 기기"
                note="멈춘 채 72시간 넘게 보고가 없습니다(이탈·재설치·브라우저 바뀜). 경고에는 넣지 않습니다."
                testid="ops-disconnected"
              >
                <DataTable
                  columns={disconnectedColumns}
                  rows={d.disconnected}
                  rowKey={(s) => `${s.userId}:${s.device?.deviceId ?? ""}`}
                  rowTestid="ops-disconnected-item"
                />
              </Section>
            )}

            <Section title="백업" testid="ops-backup">
              <div className="grid gap-x-8 md:grid-cols-2">
                <BackupRow
                  label="마지막 일일 백업"
                  run={d.backup?.lastDaily}
                  testid="ops-backup-daily"
                  extra={
                    d.backup?.lastDaily && !d.backup.lastDaily.ok
                      ? `마지막 성공 ${kst(d.backup.lastOkDailyAt)}`
                      : undefined
                  }
                />
                <BackupRow
                  label="마지막 복원 시험"
                  run={d.backup?.lastRestoreTest}
                  testid="ops-backup-restore"
                />
              </div>
            </Section>

            <Section title={`사용자 ${users.length}명`} testid="ops-users">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <SearchInput
                  data-testid="ops-user-search"
                  placeholder="이름·메일 앞부분 검색"
                  aria-label="사용자 검색"
                  value={search}
                  onCommit={(v) => setQ({ user: v || null, page: null })}
                  className="w-64 max-w-full"
                />
                <select
                  data-testid="ops-user-sort"
                  aria-label="정렬"
                  value={sort}
                  onChange={(e) =>
                    setQ({ sort: e.target.value === "sync" ? null : e.target.value, page: null })
                  }
                  className="rounded-md border border-line bg-bg px-2 py-1.5"
                >
                  <option value="sync">마지막 동기 순</option>
                  <option value="active">마지막 활동 순</option>
                </select>
              </div>
              {(data?.users.length ?? 0) >= USERS_LIMIT && (
                <p data-testid="ops-users-capped" className="mb-2 text-muted text-xs">
                  최근 {USERS_LIMIT.toLocaleString("ko-KR")}명만 표시합니다.
                </p>
              )}
              {paged.rows.length === 0 ? (
                <Empty
                  testid="ops-users-empty"
                  action={
                    search ? (
                      <Button onClick={() => setQ({ user: null, page: null })}>검색 지우기</Button>
                    ) : undefined
                  }
                >
                  {search ? "검색 결과가 없습니다." : "사용자가 없습니다."}
                </Empty>
              ) : (
                <DataTable
                  columns={userColumns}
                  rows={paged.rows}
                  rowKey={(u) => u.userId}
                  rowTestid="ops-user"
                  scrollKey={paged.page}
                />
              )}
              <Pager
                page={paged.page}
                total={users.length}
                onPage={(p) => setQ({ page: p > 1 ? String(p) : null })}
              />
            </Section>
          </>
        )}
      </Loaded>
    </>
  );
}

export function OpsScreen() {
  return (
    <RoleGate roles={ADMIN_ONLY}>
      <Screen />
    </RoleGate>
  );
}
