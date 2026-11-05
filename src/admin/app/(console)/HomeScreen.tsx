"use client";

// 요약. 역할마다 볼 수 있는 칸만 부르고, 칸마다 따로 실패한다(SPEC-033).
// 신고 대기는 큐 줄 수를 센다. 통계의 신고 수는 대상별 묶음과 자동 보류가 달라 큐와 맞지 않는다.
import { FeedbackKind, FeedbackStatus, Role } from "@app/contracts";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { useSession } from "@/app/components/SessionProvider";
import { Button, PageHeader, useTick } from "@/app/components/ui";
import { ago, kst, num } from "@/lib/format";
import { reasonText } from "@/lib/opsReasons";
import { adminApi, feedbackApi, moderationApi, opsApi } from "@/lib/rpc";
import { RefreshSignal, type Resource, useResource } from "@/lib/useResource";

const QUEUE_LIMIT = 200;
const ENTRIES_LIMIT = 200;
const REFRESH_MS = 5 * 60_000;
const OPEN: ReadonlySet<FeedbackStatus> = new Set([
  FeedbackStatus.NEW,
  FeedbackStatus.APPROVED,
  FeedbackStatus.IN_PROGRESS,
]);

function Card<T>({
  title,
  href,
  resource,
  testid,
  children,
}: {
  title: string;
  href?: string;
  resource: Resource<T>;
  testid: string;
  children: (data: T) => ReactNode;
}) {
  useTick();
  return (
    <section data-testid={testid} className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="font-medium text-muted">{title}</h2>
        {href && (
          <Link className="text-accent text-xs underline" href={href}>
            열기
          </Link>
        )}
      </div>
      {resource.data !== null ? (
        children(resource.data)
      ) : resource.error ? (
        <div data-testid={`${testid}-error`}>
          <p role="alert">{resource.error}</p>
          <Button className="mt-2" onClick={() => void resource.reload()}>
            다시 시도
          </Button>
        </div>
      ) : (
        <p className="text-muted">불러오는 중…</p>
      )}
      {resource.data !== null && resource.loadedAt && (
        <div className="mt-2 text-muted text-xs">
          {ago(resource.loadedAt)} 기준
          {resource.error && (
            <div data-testid={`${testid}-stale`} className="mt-1 text-text">
              새로고침 실패. {resource.error}{" "}
              <button type="button" className="py-1 underline" onClick={() => void resource.reload()}>
                다시 시도
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const Big = ({ testid, children }: { testid: string; children: ReactNode }) => (
  <p data-testid={testid} className="text-3xl font-semibold tabular-nums">
    {children}
  </p>
);

function AlertCard() {
  const res = useResource(() => opsApi.getOpsStatus({}), REFRESH_MS);
  return (
    <Card title="운영 경고" href="/ops" resource={res} testid="home-alert">
      {(d) =>
        d.alert ? (
          <ul className="space-y-0.5">
            {d.alertReasons.map((r) => (
              <li key={r} data-testid="home-alert-reason" className="font-medium text-danger">
                {reasonText(r, d.stalled.length)}
              </li>
            ))}
          </ul>
        ) : (
          <p data-testid="home-alert-clear" className="text-muted">
            이상 없음
          </p>
        )
      }
    </Card>
  );
}

function QueueCard() {
  const res = useResource(() => moderationApi.listQueue({ limit: QUEUE_LIMIT }), REFRESH_MS);
  return (
    <Card title="신고 대기" href="/moderation" resource={res} testid="home-queue">
      {(d) => (
        <Big testid="home-queue-count">
          {d.items.length >= QUEUE_LIMIT ? `${QUEUE_LIMIT}+` : num(d.items.length)}
        </Big>
      )}
    </Card>
  );
}

function FeedbackCard() {
  const res = useResource(() => feedbackApi.listEntries({ kind: FeedbackKind.USER }), REFRESH_MS);
  return (
    <Card title="미처리 사용자 의견" href="/user-feedback" resource={res} testid="home-feedback">
      {(d) => {
        // 미처리는 서버 정렬과 같다: 새 글·승인·진행 중. 목록이 상한에 닿으면 실제로는 더 있을 수 있다.
        const n = d.entries.filter((e) => OPEN.has(e.status)).length;
        return (
          <Big testid="home-feedback-count">
            {num(n)}
            {d.entries.length >= ENTRIES_LIMIT ? "+" : ""}
          </Big>
        );
      }}
    </Card>
  );
}

function UsageCard() {
  const res = useResource(() => adminApi.getUsageStats({}), REFRESH_MS);
  return (
    <Card title="접속과 활성" href="/stats" resource={res} testid="home-usage">
      {(d) =>
        d.started ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-muted text-xs">현재 접속(5분)</p>
              <Big testid="home-online">{num(d.online?.total ?? 0)}</Big>
            </div>
            <div>
              <p className="text-muted text-xs">오늘 활성</p>
              <Big testid="home-dau">{num(d.dau?.total ?? 0)}</Big>
            </div>
            <p className="col-span-2 text-muted text-xs">집계 {kst(d.generatedAt)}</p>
          </div>
        ) : (
          <p data-testid="home-usage-not-started" className="text-muted">
            집계 시행 전입니다.
          </p>
        )
      }
    </Card>
  );
}

export function HomeScreen() {
  const { role } = useSession();
  const admin = role === Role.ADMIN;
  const [signal, setSignal] = useState(0);
  return (
    <section data-testid="home">
      <PageHeader title="요약">
        <Button data-testid="home-refresh" onClick={() => setSignal((n) => n + 1)}>
          새로고침
        </Button>
      </PageHeader>
      <RefreshSignal.Provider value={signal}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {admin && <AlertCard />}
          {(admin || role === Role.MODERATOR) && <QueueCard />}
          {admin && <FeedbackCard />}
          {admin && <UsageCard />}
        </div>
      </RefreshSignal.Provider>
    </section>
  );
}
