"use client";
// 추천 탭(SPEC-030) — 공개 글을 서버 규칙 점수로 받는다. 끝은 next_offset 0 으로만 판단한다.
// 쪽 사이에 점수가 움직여 겹칠 수 있어 id 로 거른다. 전부 겹쳐도 끝이 아니므로 표식을 다시 세워 다음 쪽을 부른다.
import type { WeightUnit } from "@app/core";
import { RECOMMENDED_AD_EVERY, recommendedAdAfter } from "@app/core/domain/adPolicy";
import type { Post } from "@app/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { feedClient } from "@/lib/feedClient";
import { AdSlot } from "../ads/AdSlot";
import { ListState } from "../ui/ListState";
import { FEED_PAGE_SIZE, InfiniteSentinel } from "./InfiniteSentinel";
import { PostCard } from "./PostCard";

export function RecommendedFeed({
  meId,
  unit,
  onFollowChanged,
  synced,
  onPostChanged,
}: {
  meId: string | null;
  unit: WeightUnit;
  /** 팔로우가 바뀌면 팔로잉 탭을 돌아올 때 다시 읽게 알린다. */
  onFollowChanged: () => void;
  /** 팔로잉 탭에서 바뀐 글 — 같은 글이 여기 있으면 좋아요·저장을 맞춘다. */
  synced: Post | null;
  /** 여기서 바뀐 글을 팔로잉 탭에도 알린다. */
  onPostChanged: (p: Post) => void;
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [next, setNext] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const gen = useRef(0);
  const busy = useRef(false);

  const load = useCallback(async () => {
    const mine = ++gen.current;
    busy.current = true;
    setLoading(true);
    setError(false);
    try {
      const res = await feedClient().listRecommended({ limit: FEED_PAGE_SIZE });
      if (mine !== gen.current) return;
      setPosts(res.posts);
      setNext(res.nextOffset);
    } catch {
      if (mine === gen.current) setError(true);
    } finally {
      if (mine === gen.current) {
        busy.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      gen.current += 1;
    };
  }, [load]);

  const loadMore = useCallback(async () => {
    if (busy.current || !next) return;
    const mine = gen.current;
    busy.current = true;
    try {
      const res = await feedClient().listRecommended({ offset: next, limit: FEED_PAGE_SIZE });
      if (mine !== gen.current) return;
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...res.posts.filter((p) => !seen.has(p.id))];
      });
      setNext(res.nextOffset);
    } catch {
      // 다음에 끝에 닿을 때 다시 시도한다 — 받아 둔 목록은 그대로 둔다
    } finally {
      if (mine === gen.current) busy.current = false;
    }
  }, [next]);

  const replace = useCallback(
    (p: Post) => {
      setPosts((prev) => prev.map((x) => (x.id === p.id ? p : x)));
      onPostChanged(p);
    },
    [onPostChanged],
  );
  useEffect(() => {
    if (!synced) return;
    // 팔로잉 목록의 글에는 팔로우 표시가 없다 — 그 값만은 이쪽 것을 지킨다.
    setPosts((prev) =>
      prev.map((x) =>
        x.id === synced.id ? ({ ...synced, authorFollowedByMe: x.authorFollowedByMe } as Post) : x,
      ),
    );
  }, [synced]);
  const drop = useCallback((id: string) => {
    setPosts((prev) => prev.filter((x) => x.id !== id));
  }, []);
  // 같은 작성자의 다른 카드도 함께 바꾼다.
  const setFollowed = useCallback(
    (authorId: string, followed: boolean) => {
      setPosts((prev) =>
        prev.map((x) => (x.author?.id === authorId ? ({ ...x, authorFollowedByMe: followed } as Post) : x)),
      );
      onFollowChanged();
    },
    [onFollowChanged],
  );

  return (
    <div
      // [원본] pb-[96px] — FAB 자리 여백. 없앴다(사용자 지시 2026-11-06)
      className="flex-1 p-[var(--spacing-lg)] pt-[var(--spacing-md)] pb-0"
      data-testid="feed-recommended-list"
    >
      {posts.length === 0 ? (
        <ListState
          loading={loading}
          error={error}
          onRetry={load}
          skeletonVariant="post"
          emptyIcon="newspaper-outline"
          emptyTitle="feed.recommendedEmptyTitle"
          emptyMessage="feed.recommendedEmptyMessage"
        />
      ) : (
        <>
          {posts.flatMap((p, i) => [
            <PostCard
              key={p.id}
              post={p}
              meId={meId}
              unit={unit}
              onChanged={replace}
              onDeleted={drop}
              onReported={drop}
              onFollowChange={setFollowed}
            />,
            ...(recommendedAdAfter(i)
              ? [<AdSlot key={`ad-${Math.floor(i / RECOMMENDED_AD_EVERY)}`} placement="feed" />]
              : []),
          ])}
          <InfiniteSentinel key={`${posts.length}:${next}`} onReach={loadMore} disabled={!next} />
        </>
      )}
    </div>
  );
}
