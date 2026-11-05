"use client";

// 사용자 의견. 관리자만 보고 처리한다.
import { FeedbackKind, Role } from "@app/contracts";
import { FeedbackTable } from "@/app/components/FeedbackTable";
import { RoleGate } from "@/app/components/RoleGate";
import { Loaded, PageHeader, RefreshBar } from "@/app/components/ui";
import { feedbackApi } from "@/lib/rpc";
import { useResource } from "@/lib/useResource";

const ROLES = [Role.ADMIN] as const;
const LIMIT = 200;
const REFRESH_MS = 5 * 60_000;

function Screen() {
  const res = useResource(
    async () => (await feedbackApi.listEntries({ kind: FeedbackKind.USER })).entries,
    REFRESH_MS,
  );
  return (
    <div data-testid="user-feedback-screen">
      <PageHeader title="사용자 의견">
        <RefreshBar resource={res} />
      </PageHeader>
      <div className="rounded-lg border border-line bg-surface p-4">
        <Loaded resource={res}>
          {(entries) => (
            <FeedbackTable
              entries={entries}
              limit={LIMIT}
              showCategory={false}
              emptyText="아직 들어온 의견이 없습니다."
              onChange={(next) => {
                res.mutate((list) => list.map((e) => (e.id === next.id ? next : e)));
                void res.reload();
              }}
              onConflict={() => void res.reload()}
            />
          )}
        </Loaded>
      </div>
    </div>
  );
}

export function UserFeedbackScreen() {
  return (
    <RoleGate roles={ROLES}>
      <Screen />
    </RoleGate>
  );
}
