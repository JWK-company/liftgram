"use client";
// @plm SRS-008  사람 찾기 — app의 features/social/DiscoverScreen.tsx를 웹으로
//
// 이름·이메일 부분일치로 찾고, 그 자리에서 팔로우한다.
// 검색은 **입력이 멈춘 뒤** 보낸다(타이핑마다 보내면 한 사람 찾는 데 열 번을 조른다).
import type { UserResult } from "@app/contracts";
import { routes } from "@app/contracts";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { feedClient } from "@/lib/feedClient";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/inputs";
import { ListState } from "../ui/ListState";
import { AppText, Card } from "../ui/primitives";
import { ScreenHeader } from "../ui/ScreenHeader";

export default function DiscoverClient() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setUsers([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    // 300ms 동안 더 안 치면 그때 보낸다.
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await feedClient().searchUsers({ query: q });
        if (!cancelled) setUsers(res.users);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setSearched(true);
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

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
        title={t("discover.title")}
        back={
          <a href="/feed" aria-label={t("feed.title")} data-testid="discover-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
      />
      <div className="px-[var(--spacing-lg)] pt-[var(--spacing-md)]">
        <TextField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("discover.searchPlaceholder")}
          testId="discover-query"
        />
      </div>
      <div className="flex-1 px-[var(--spacing-lg)]" data-testid="discover-list">
        {users.length === 0 ? (
          searched || loading ? (
            <ListState
              loading={loading}
              error={error}
              skeletonVariant="row"
              emptyIcon="search-outline"
              emptyTitle="discover.empty"
              emptyMessage="discover.emptyMessage"
            />
          ) : null
        ) : (
          users.map((u) => (
            <Card key={u.author?.id} className="mb-[var(--spacing-sm)]">
              <div className="flex items-center gap-[var(--spacing-sm)]">
                <a
                  href={routes.userProfile(u.author?.id ?? "")}
                  className="flex min-w-0 flex-1 items-center gap-[var(--spacing-sm)]"
                  data-testid="discover-user"
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
                  testId="discover-follow"
                />
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
