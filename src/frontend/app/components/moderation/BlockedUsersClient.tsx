"use client";
// @plm SRS-020  차단 목록 — app의 features/social/BlockedUsersScreen.tsx를 웹으로
//
// 차단은 프로필에서 걸지만 **푸는 곳은 여기뿐**이다(차단하면 그 사람 프로필이 목록·검색에서 사라지므로).
// 그래서 이 화면이 없으면 한 번 건 차단을 되돌릴 방법이 없다.
//
// 해제는 낙관적으로 지운다 — 실패하면 다시 읽어 되돌린다.
import type { Author } from "@app/contracts";
import { useCallback, useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { feedClient } from "@/lib/feedClient";
import { useToast } from "../Toast";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { ListState } from "../ui/ListState";
import { AppText, Card } from "../ui/primitives";
import { ScreenHeader } from "../ui/ScreenHeader";

export default function BlockedUsersClient() {
  const toast = useToast();
  const [users, setUsers] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await feedClient().listBlockedUsers({});
      setUsers(res.users);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function unblock(u: Author) {
    setUsers((prev) => prev.filter((x) => x.id !== u.id));
    try {
      await feedClient().unblockUser({ userId: u.id });
    } catch {
      toast(t("moderation.actionFailed"), "error");
      void load(); // 실패 → 목록을 다시 읽어 되돌린다
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("block.title")}
        back={
          <a href="/profile" aria-label={t("profile.title")} data-testid="block-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
      />
      <div className="flex-1 p-[var(--spacing-lg)] pt-[var(--spacing-md)]" data-testid="block-list">
        {users.length === 0 ? (
          <ListState
            loading={loading}
            error={error}
            onRetry={load}
            skeletonVariant="row"
            emptyIcon="shield-checkmark-outline"
            emptyTitle="block.emptyTitle"
            emptyMessage="block.emptyMessage"
          />
        ) : (
          users.map((u) => (
            <Card key={u.id} className="mb-[var(--spacing-sm)]">
              <div className="flex items-center gap-[var(--spacing-md)]">
                <Avatar name={u.displayName} url={u.avatarUrl} size={40} />
                <AppText variant="body" className="min-w-0 flex-1 truncate font-medium!">
                  {u.displayName || t("discover.unnamed")}
                </AppText>
                <Button
                  title={t("profile.unblock")}
                  variant="secondary"
                  size="sm"
                  fullWidth={false}
                  onPress={() => unblock(u)}
                  testId="block-unblock"
                />
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
