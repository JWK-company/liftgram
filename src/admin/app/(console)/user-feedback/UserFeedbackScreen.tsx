"use client";

// 사용자 의견. 관리자는 처리하고, 협업자는 작성자 없이 읽기만 한다(작성자 이름은 서버가 관리자에게만 준다).
import { FeedbackKind, Role } from "@app/contracts";
import { FeedbackTable } from "@/app/components/FeedbackTable";
import { RoleGate } from "@/app/components/RoleGate";
import { useSession } from "@/app/components/SessionProvider";
import { Loaded, PageHeader, RefreshBar } from "@/app/components/ui";
import { feedbackApi } from "@/lib/rpc";
import { useResource } from "@/lib/useResource";

const ROLES = [Role.ADMIN, Role.COWORKER] as const;
const LIMIT = 200;
const REFRESH_MS = 5 * 60_000;

function Screen() {
  const { role } = useSession();
  const res = useResource(
    async () => (await feedbackApi.listEntries({ kind: FeedbackKind.USER })).entries,
    REFRESH_MS,
  );
  const isAdmin = role === Role.ADMIN;
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
              canAct={isAdmin}
              showAuthor={isAdmin}
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
