"use client";
// @plm SRS-007  글 목록 화면 — 해시태그·저장함이 같은 껍데기를 쓴다
//
// 두 화면이 다른 것은 **어떤 목록을 가져오는가**와 **비었을 때 무슨 말을 하는가**뿐이다.
// 카드·페이지 넘김·낙관적 갱신은 똑같으므로 여기 한 번만 적는다 —
// 복사해 두면 한쪽만 고쳐지는 날이 온다.
import type { WeightUnit } from "@app/core";
import type { Cursor, Post } from "@app/contracts";
import { useCallback, useEffect, useState } from "react";
import { t, type TransKey } from "@/lib/i18n";
import { useAuth } from "../AuthProvider";
import { Icon } from "../ui/Icon";
import { ListState } from "../ui/ListState";
import { ScreenHeader } from "../ui/ScreenHeader";
import type { IconName } from "../ui/Icon";
import { InfiniteSentinel } from "./InfiniteSentinel";
import { PostCard } from "./PostCard";
import { useWeightUnit } from "./useWeightUnit";

export function PostListScreen({
  title,
  fetchPage,
  emptyIcon,
  emptyTitle,
  emptyMessage,
  testId,
}: {
  title: string;
  /** 커서가 없으면 첫 페이지. 화면은 어떤 RPC인지 모른다. */
  fetchPage: (cursor?: Cursor) => Promise<{ posts: Post[]; nextCursor?: Cursor }>;
  emptyIcon: IconName;
  emptyTitle: TransKey;
  emptyMessage?: TransKey;
  testId: string;
}) {
  const { user } = useAuth();
  const unit = useWeightUnit();
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<Cursor | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetchPage();
      setPosts(res.posts);
      setCursor(res.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    try {
      const res = await fetchPage(cursor);
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...res.posts.filter((p) => !seen.has(p.id))];
      });
      setCursor(res.nextCursor);
    } catch {
      // 이미 보이는 목록은 그대로 쓸 수 있다.
    }
  }, [cursor, fetchPage]);

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={title}
        back={
          <a href="/feed" aria-label={t("feed.title")} data-testid={`${testId}-back`}>
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
      />
      <div className="flex-1 p-[var(--spacing-lg)]" data-testid={testId}>
        {posts.length === 0 ? (
          <ListState
            loading={loading}
            error={error}
            onRetry={load}
            skeletonVariant="post"
            emptyIcon={emptyIcon}
            emptyTitle={emptyTitle}
            emptyMessage={emptyMessage}
          />
        ) : (
          <>
            {posts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                meId={user?.id ?? null}
                unit={unit as WeightUnit}
                onChanged={(next) => setPosts((prev) => prev.map((x) => (x.id === next.id ? next : x)))}
                onDeleted={(id) => setPosts((prev) => prev.filter((x) => x.id !== id))}
              />
            ))}
            <InfiniteSentinel onReach={loadMore} disabled={!cursor} />
          </>
        )}
      </div>
    </div>
  );
}
