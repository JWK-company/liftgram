"use client";
// @plm SRS-017  새 그룹 — app의 features/social/NewGroupScreen.tsx를 웹으로
//
// **내가 팔로우하는 사람만** 고를 수 있다(서버도 같은 판정을 한다 — 여기서 거르는 것은 안내일 뿐).
// 그래서 검색 결과 중 팔로우하지 않은 사람은 목록에 두지 않는다 — 골라 놓고 거절당하면 이유를 모른다.
import type { UserResult } from "@app/contracts";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { dmClient } from "@/lib/dmClient";
import { feedClient, feedErrorMessage } from "@/lib/feedClient";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/inputs";
import { ListState } from "../ui/ListState";
import { AppText, Card } from "../ui/primitives";
import { ScreenHeader } from "../ui/ScreenHeader";

export default function NewGroupClient() {
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserResult[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setUsers([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await feedClient().searchUsers({ query: q });
        // 팔로우한 사람만 남긴다 — 서버가 거절할 사람을 고르게 두지 않는다.
        if (!cancelled) setUsers(res.users.filter((u) => u.following));
      } catch {
        if (!cancelled) setUsers([]);
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

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  async function create() {
    if (!selectedIds.length || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await dmClient().createGroup({ userIds: selectedIds, title: title.trim() });
      if (res.conversation) location.href = `/messages/${res.conversation.id}`;
    } catch (e) {
      setError(feedErrorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("group.title")}
        back={
          <a href="/messages" aria-label={t("dm.title")} data-testid="group-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
      />

      <div className="px-[var(--spacing-lg)] pt-[var(--spacing-md)]">
        <TextField
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("group.titlePlaceholder")}
          testId="group-title"
        />
        <TextField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("discover.searchPlaceholder")}
          testId="group-search"
        />
      </div>

      <div className="flex-1 px-[var(--spacing-lg)]" data-testid="group-list">
        {users.length === 0 ? (
          searched || loading ? (
            <ListState
              loading={loading}
              skeletonVariant="row"
              emptyIcon="people-outline"
              emptyTitle="group.noFollowees"
            />
          ) : null
        ) : (
          users.map((u) => {
            const id = u.author?.id ?? "";
            const on = !!selected[id];
            return (
              <Card key={id} className="mb-[var(--spacing-sm)]">
                <button
                  type="button"
                  onClick={() => setSelected((s) => ({ ...s, [id]: !s[id] }))}
                  data-testid="group-user"
                  aria-pressed={on}
                  className="flex w-full items-center gap-[var(--spacing-sm)] text-left"
                >
                  <Avatar name={u.author?.displayName} url={u.author?.avatarUrl} size={36} />
                  <AppText variant="body" className="block min-w-0 flex-1 truncate font-medium!">
                    {u.author?.displayName || t("discover.unnamed")}
                  </AppText>
                  <Icon
                    name={on ? "checkmark-circle" : "ellipse-outline"}
                    size={22}
                    color={on ? "var(--color-brand)" : "var(--color-ink3)"}
                  />
                </button>
              </Card>
            );
          })
        )}
      </div>

      {error ? (
        <div className="px-[var(--spacing-lg)] pb-[var(--spacing-xs)]">
          <AppText variant="caption" color="danger" data-testid="group-error">
            {error}
          </AppText>
        </div>
      ) : null}

      <div className="border-(--color-line) border-t p-[var(--spacing-md)]">
        <Button
          title={t("group.create", { count: selectedIds.length })}
          loading={creating}
          disabled={selectedIds.length === 0}
          onPress={create}
          testId="group-create"
        />
      </div>
    </div>
  );
}
