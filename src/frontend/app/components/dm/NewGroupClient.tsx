"use client";
// @plm SRS-017  새 메시지 — 메시지 목록의 ✎ 로 들어온다(SPEC-048 Phase 2 · S-18 · S-24 합침)
//
// [원본] 「새 그룹」 화면: 그룹 이름 칸 + 검색해서 팔로우한 사람을 골라 그룹을 만들었다(한 명이어도 그룹).
//   「그룹」이 사용자 분류처럼 읽혀 헷갈렸다(S-18). 옛 판은 git 0bfc17e 의 이 파일.
// [개선] 내가 팔로우하는 사람 목록이 먼저 보이고(검색으로 좁힘), 고른 사람은 위에 칩으로.
//   한 명 = 「대화 시작」(1:1) · 두 명 이상 = 대화 이름 칸 + 「단체 대화 만들기(N명)」.
//   단체 대화는 **내가 팔로우하는 사람만**(서버도 같은 판정) — 그래서 검색 결과도 팔로우한 사람만 남긴다.
import type { UserResult } from "@app/contracts";
import { FollowListMode, routes } from "@app/contracts";
import { useEffect, useState } from "react";
import { dmClient } from "@/lib/dmClient";
import { feedClient, feedErrorMessage } from "@/lib/feedClient";
import { t } from "@/lib/i18n";
import { navigate } from "@/lib/nav";
import { useAuth } from "../AuthProvider";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/inputs";
import { ListState } from "../ui/ListState";
import { AppText } from "../ui/primitives";
import { ScreenHeader } from "../ui/ScreenHeader";

export default function NewGroupClient() {
  const { user, loading: authLoading } = useAuth();
  const meId = user?.id ?? null;
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserResult[]>([]);
  // 고른 사람 — 검색어가 바뀌어도 칩에 이름이 남게 사람째 들고 있는다(고른 순서 유지)
  const [picked, setPicked] = useState<Map<string, UserResult>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = query.trim();

  // biome-ignore lint/correctness/useExhaustiveDependencies: retry 는 「다시 시도」 신호다
  useEffect(() => {
    // 신원이 정해진 뒤에 부른다(토큰 갱신 경합 — ConversationsClient 와 같은 규칙)
    if (authLoading || !meId) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setUsers([]); // 검색어가 바뀌면 옛 목록을 눌리지 않게 비운다
    const timer = setTimeout(
      async () => {
        try {
          const list = q
            ? (await feedClient().searchUsers({ query: q })).users.filter((u) => u.following)
            : (await feedClient().listFollows({ userId: meId, mode: FollowListMode.FOLLOWING, limit: 50 }))
                .users;
          if (!cancelled) setUsers(list);
        } catch {
          if (!cancelled) setFailed(true);
        } finally {
          if (!cancelled) setLoading(false);
        }
      },
      q ? 300 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [authLoading, meId, q, retry]);

  const count = picked.size;
  const group = count >= 2;

  function toggle(u: UserResult) {
    const id = u.author?.id;
    if (!id) return;
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, u);
      return next;
    });
  }

  async function start() {
    if (!count || creating) return;
    setCreating(true);
    setError(null);
    try {
      const ids = [...picked.keys()];
      const conv =
        ids.length === 1
          ? (await dmClient().getOrCreateDirect({ userId: ids[0] })).conversation
          : (await dmClient().createGroup({ userIds: ids, title: title.trim() })).conversation;
      if (conv) navigate(routes.conversation(conv.id));
      else setCreating(false);
    } catch (e) {
      setError(feedErrorMessage(e));
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("dm.newMessage")}
        back={
          <a href="/messages" aria-label={t("dm.title")} data-testid="group-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
      />

      <div className="px-[var(--spacing-lg)] pt-[var(--spacing-md)]">
        {/* 고른 사람 칩 — 누르면 뺀다 */}
        {count ? (
          <div className="mb-[var(--spacing-sm)] flex flex-wrap gap-[6px]" data-testid="new-msg-picked">
            {[...picked.entries()].map(([id, u]) => (
              <button
                key={id}
                type="button"
                data-testid="new-msg-chip"
                aria-label={t("dm.unpick", { name: u.author?.displayName || t("discover.unnamed") })}
                onClick={() => toggle(u)}
                className="flex min-h-[44px] items-center gap-[4px] rounded-full bg-(--color-brand-muted) pr-[8px] pl-[12px] text-(--color-brand) text-[length:var(--text-sm)]"
              >
                {u.author?.displayName || t("discover.unnamed")}
                <Icon name="close" size={14} color="var(--color-brand)" />
              </button>
            ))}
          </div>
        ) : null}
        {/* 두 명 이상일 때만 대화 이름 — 한 명으로 줄면 숨기되 적은 이름은 남긴다 */}
        <div className={group ? "" : "hidden"}>
          <TextField
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("group.titlePlaceholder")}
            testId="group-title"
          />
        </div>
        <TextField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("discover.searchPlaceholder")}
          testId="group-search"
        />
      </div>

      <div className="flex-1 px-[var(--spacing-lg)]" data-testid="group-list">
        {users.length === 0 ? (
          <ListState
            loading={loading || authLoading}
            error={failed}
            onRetry={() => setRetry((n) => n + 1)}
            skeletonVariant="row"
            emptyIcon="people-outline"
            emptyTitle="group.noFollowees"
          />
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-card) [&>*+*]:border-(--color-line) [&>*+*]:border-t">
            {users.map((u) => {
              const id = u.author?.id ?? "";
              const on = picked.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(u)}
                  data-testid="group-user"
                  aria-pressed={on}
                  className="flex min-h-[52px] w-full items-center gap-[var(--spacing-sm)] px-[var(--spacing-md)] text-left"
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
              );
            })}
          </div>
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
        {group ? (
          <Button
            title={t("group.create", { count })}
            loading={creating}
            onPress={start}
            testId="group-create"
          />
        ) : (
          <Button
            title={t("dm.startDirect")}
            loading={creating}
            disabled={count === 0}
            onPress={start}
            testId="dm-start"
          />
        )}
      </div>
    </div>
  );
}
