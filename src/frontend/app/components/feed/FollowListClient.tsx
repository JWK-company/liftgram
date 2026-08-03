"use client";
// @plm SRS-008  팔로워·팔로잉 목록 — app의 features/social/FollowListScreen.tsx를 웹으로
//
// 프로필의 숫자를 눌러 들어온다. 어느 쪽을 보는지는 주소의 mode가 정한다 —
// 그래야 뒤로가기·새로고침·링크 공유가 같은 화면을 연다.
import type { UserResult } from "@app/contracts";
import { routes } from "@app/contracts";
import { useCallback, useEffect, useState } from "react";
import { FollowListMode } from "@app/contracts";
import { t } from "@/lib/i18n";
import { feedClient } from "@/lib/feedClient";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { ListState } from "../ui/ListState";
import { AppText, Card } from "../ui/primitives";
import { ScreenHeader } from "../ui/ScreenHeader";

export default function FollowListClient({
  userId,
  mode,
}: {
  userId: string;
  mode: "followers" | "following";
}) {
  const [users, setUsers] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await feedClient().listFollows({
        userId,
        mode: mode === "following" ? FollowListMode.FOLLOWING : FollowListMode.FOLLOWERS,
      });
      setUsers(res.users);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [userId, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFollow(u: UserResult) {
    const id = u.author?.id;
    if (!id) return;
    const following = u.following;
    setUsers((prev) =>
      prev.map((x) => (x.author?.id === id ? ({ ...x, following: !following } as UserResult) : x)),
    );
    try {
      if (following) await feedClient().unfollow({ userId: id });
      else await feedClient().follow({ userId: id });
    } catch {
      setUsers((prev) => prev.map((x) => (x.author?.id === id ? ({ ...x, following } as UserResult) : x)));
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={mode === "following" ? t("profile.following") : t("profile.followers")}
        back={
          <a href={routes.userProfile(userId)} aria-label={t("profile.title")} data-testid="follows-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
      />
      <div className="flex-1 p-[var(--spacing-lg)]" data-testid="follows-list">
        {users.length === 0 ? (
          <ListState
            loading={loading}
            error={error}
            onRetry={load}
            skeletonVariant="row"
            emptyIcon="people-outline"
            emptyTitle="discover.empty"
          />
        ) : (
          users.map((u) => (
            <Card key={u.author?.id} className="mb-[var(--spacing-sm)]">
              <div className="flex items-center gap-[var(--spacing-sm)]">
                <a
                  href={routes.userProfile(u.author?.id ?? "")}
                  className="flex min-w-0 flex-1 items-center gap-[var(--spacing-sm)]"
                  data-testid="follows-user"
                >
                  <Avatar name={u.author?.displayName} url={u.author?.avatarUrl} size={36} />
                  <AppText variant="body" className="block min-w-0 flex-1 truncate font-medium!">
                    {u.author?.displayName || t("discover.unnamed")}
                  </AppText>
                </a>
                <Button
                  title={u.following ? t("discover.following") : t("discover.follow")}
                  variant={u.following ? "secondary" : "primary"}
                  size="sm"
                  fullWidth={false}
                  onPress={() => toggleFollow(u)}
                  testId="follows-follow"
                />
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
