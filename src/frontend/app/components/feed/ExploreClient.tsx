"use client";
// @plm SRS-018  발견 — app의 features/social/ExploreScreen.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 한 화면이 두 모드다:
//   · 검색어가 비었으면 **발견** — 트렌딩 태그 · 추천 사람 · 인기 글
//   · 검색어가 있으면 **검색** — 사람 · 태그 · 글을 한 번에
//
// ── 부분 실패를 관용한다 ────────────────────────────────────────────────────
// 발견은 세 갈래를 따로 읽는다. 하나가 실패해도 나머지는 보여 준다 — 셋 다 실패해야 오류다.
// 검색은 반대로 **하나로 묶어** 실패하면 전체가 실패다(부분 결과를 성공처럼 보이면
// "없다"와 "못 찾았다"를 구분할 수 없다).
//
// ── 검색은 입력이 멈춘 뒤 ───────────────────────────────────────────────────
// 300ms 디바운스 + 세대 가드. 타이핑 중 도착한 옛 응답이 새 결과를 덮지 않게 한다.
// ─────────────────────────────────────────────────────────────────────────────
import type { WeightUnit } from "@app/core";
import type { HashtagCount, Post, UserResult } from "@app/contracts";
import { routes } from "@app/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { feedClient } from "@/lib/feedClient";
import { navigate } from "@/lib/nav";
import { useAuth } from "../AuthProvider";
import { Avatar } from "../ui/Avatar";
import { BackLink } from "../ui/BackLink";
import { Button } from "../ui/Button";
import { TextField } from "../ui/inputs";
import { ListState } from "../ui/ListState";
import { AppText, Card, EmptyState, SectionHeader } from "../ui/primitives";
import { ScreenHeader } from "../ui/ScreenHeader";
import { PostCard } from "./PostCard";
import { useWeightUnit } from "./useWeightUnit";

export default function ExploreClient() {
  const { user, loading: authLoading } = useAuth();
  const unit = useWeightUnit();

  // 발견 모드
  const [posts, setPosts] = useState<Post[]>([]);
  const [tags, setTags] = useState<HashtagCount[]>([]);
  const [people, setPeople] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // 검색 모드
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ users: UserResult[]; tags: HashtagCount[]; posts: Post[] } | null>(
    null,
  );
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const searchGen = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    // 셋을 따로 읽는다 — 하나가 실패해도 나머지는 보여 준다.
    const [ex, tr, su] = await Promise.allSettled([
      feedClient().listExplore({}),
      feedClient().trendingHashtags({}),
      feedClient().suggestedUsers({}),
    ]);
    if (ex.status === "fulfilled") setPosts(ex.value.posts);
    if (tr.status === "fulfilled") setTags(tr.value.tags);
    if (su.status === "fulfilled") setPeople(su.value.users);
    setLoadError(ex.status === "rejected" && tr.status === "rejected" && su.status === "rejected");
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    void load();
  }, [user, load]);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      searchGen.current++; // 진행 중이던 검색을 무효로 — 지운 뒤 옛 결과가 뜨지 않게
      setResult(null);
      setSearching(false);
      setSearchError(false);
      return;
    }
    const mine = ++searchGen.current;
    setResult(null); // 새 검색 — 이전 결과 잔상을 즉시 지운다
    setSearchError(false);
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await feedClient().search({ query });
        if (mine !== searchGen.current) return;
        setResult({ users: res.users, tags: res.tags, posts: res.posts });
      } catch {
        if (mine === searchGen.current) setSearchError(true);
      } finally {
        if (mine === searchGen.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  async function toggleFollow(u: UserResult, inSearch: boolean) {
    const id = u.author?.id;
    if (!id) return;
    const following = u.following;
    const patch = (x: UserResult) =>
      x.author?.id === id ? ({ ...x, following: !following } as UserResult) : x;

    if (inSearch) setResult((r) => (r ? { ...r, users: r.users.map(patch) } : r));
    else setPeople((prev) => prev.map(patch));

    try {
      if (following) await feedClient().unfollow({ userId: id });
      else await feedClient().follow({ userId: id });
    } catch {
      const undo = (x: UserResult) => (x.author?.id === id ? ({ ...x, following } as UserResult) : x);
      if (inSearch) setResult((r) => (r ? { ...r, users: r.users.map(undo) } : r));
      else setPeople((prev) => prev.map(undo));
    }
  }

  const inSearch = q.trim().length > 0;

  // 로그인하지 않았을 때 — 빈 화면 대신 피드 탭과 같은 안내(화면 지도 2026-11-09)
  // 로그인 확인 중에는 머리줄만 — 탐색 화면이 먼저 그려졌다 안내로 바뀌며 깜빡이지 않게(REV 낮음)
  if (!user) {
    return (
      <div className="flex flex-1 flex-col">
        <ScreenHeader
          title={t("explore.title")}
          back={<BackLink fallbackHref="/feed" label={t("feed.title")} testId="explore-back" />}
        />
        {authLoading ? null : (
          <div className="flex flex-1 flex-col p-[var(--spacing-lg)]">
            <EmptyState
              icon="person-circle-outline"
              title={t("feed.loginRequiredTitle")}
              message={t("feed.loginRequiredMessage")}
              action={
                <Button
                  title={t("profile.loginOrSignup")}
                  icon="person-circle-outline"
                  fullWidth={false}
                  onPress={() => navigate("/account")}
                  testId="explore-login"
                />
              }
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("explore.title")}
        // [원본] <a href="/feed" …> — 들어온 곳으로(BackLink · 화면 지도 2026-11-09)
        back={<BackLink fallbackHref="/feed" label={t("feed.title")} testId="explore-back" />}
      />

      <div className="px-[var(--spacing-lg)] pt-[var(--spacing-md)]">
        <TextField
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search.placeholder")}
          testId="explore-query"
        />
      </div>

      <div className="flex-1 px-[var(--spacing-lg)]" data-testid="explore-body">
        {inSearch ? (
          <SearchResults
            onPostChanged={(next) =>
              setResult((r) => (r ? { ...r, posts: r.posts.map((x) => (x.id === next.id ? next : x)) } : r))
            }
            onPostDeleted={(id) =>
              setResult((r) => (r ? { ...r, posts: r.posts.filter((x) => x.id !== id) } : r))
            }
            result={result}
            loading={searching}
            error={searchError}
            meId={user?.id ?? null}
            unit={unit as WeightUnit}
            onFollow={(u) => toggleFollow(u, true)}
          />
        ) : (
          <>
            {tags.length > 0 ? (
              <>
                <SectionHeader title={t("explore.trending")} />
                <div className="mb-[var(--spacing-lg)] flex flex-wrap gap-[var(--spacing-xs)]">
                  {tags.map((tag) => (
                    <a
                      key={tag.tag}
                      href={routes.hashtag(tag.tag)}
                      data-testid="explore-tag"
                      className="rounded-[var(--radius-pill)] bg-(--color-surface-alt) px-[var(--spacing-md)] py-[6px]"
                    >
                      <AppText variant="caption" color="primary">{`#${tag.tag}`}</AppText>
                    </a>
                  ))}
                </div>
              </>
            ) : null}

            {people.length > 0 ? (
              <>
                <SectionHeader title={t("explore.suggested")} />
                <div className="mb-[var(--spacing-lg)]">
                  {people.map((u) => (
                    <PersonRow key={u.author?.id} user={u} onFollow={() => toggleFollow(u, false)} />
                  ))}
                </div>
              </>
            ) : null}

            <SectionHeader title={t("explore.popular")} />
            {posts.length === 0 ? (
              <ListState
                loading={loading}
                error={loadError}
                onRetry={load}
                skeletonVariant="post"
                emptyIcon="compass-outline"
                emptyTitle="explore.empty"
                emptyMessage="explore.emptyMessage"
              />
            ) : (
              posts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  meId={user?.id ?? null}
                  unit={unit as WeightUnit}
                  onChanged={(next) => setPosts((prev) => prev.map((x) => (x.id === next.id ? next : x)))}
                  onDeleted={(id) => setPosts((prev) => prev.filter((x) => x.id !== id))}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SearchResults({
  result,
  loading,
  error,
  meId,
  unit,
  onFollow,
  onPostChanged,
  onPostDeleted,
}: {
  result: { users: UserResult[]; tags: HashtagCount[]; posts: Post[] } | null;
  loading: boolean;
  error: boolean;
  meId: string | null;
  unit: WeightUnit;
  onFollow: (u: UserResult) => void;
  onPostChanged: (p: Post) => void;
  onPostDeleted: (id: string) => void;
}) {
  const empty =
    !result || (result.users.length === 0 && result.tags.length === 0 && result.posts.length === 0);
  if (empty) {
    return (
      <ListState
        loading={loading}
        error={error}
        skeletonVariant="row"
        emptyIcon="search-outline"
        emptyTitle="discover.empty"
        emptyMessage="discover.emptyMessage"
      />
    );
  }

  return (
    <div data-testid="explore-results">
      {result.users.length > 0 ? (
        <>
          <SectionHeader title={t("discover.title")} />
          <div className="mb-[var(--spacing-lg)]">
            {result.users.map((u) => (
              <PersonRow key={u.author?.id} user={u} onFollow={() => onFollow(u)} />
            ))}
          </div>
        </>
      ) : null}

      {result.tags.length > 0 ? (
        <>
          <SectionHeader title={t("hashtag.title")} />
          <div className="mb-[var(--spacing-lg)] flex flex-wrap gap-[var(--spacing-xs)]">
            {result.tags.map((tag) => (
              <a
                key={tag.tag}
                href={routes.hashtag(tag.tag)}
                data-testid="explore-tag"
                className="rounded-[var(--radius-pill)] bg-(--color-surface-alt) px-[var(--spacing-md)] py-[6px]"
              >
                <AppText variant="caption" color="primary">{`#${tag.tag}`}</AppText>
              </a>
            ))}
          </div>
        </>
      ) : null}

      {result.posts.length > 0 ? (
        <>
          <SectionHeader title={t("feed.title")} />
          {result.posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              meId={meId}
              unit={unit}
              onChanged={onPostChanged}
              onDeleted={onPostDeleted}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

function PersonRow({ user, onFollow }: { user: UserResult; onFollow: () => void }) {
  return (
    <Card className="mb-[var(--spacing-sm)]">
      <div className="flex items-center gap-[var(--spacing-sm)]">
        <a
          href={routes.userProfile(user.author?.id ?? "")}
          className="flex min-w-0 flex-1 items-center gap-[var(--spacing-sm)]"
          data-testid="explore-user"
        >
          <Avatar name={user.author?.displayName} url={user.author?.avatarUrl} size={36} />
          <AppText variant="body" className="block min-w-0 flex-1 truncate font-medium!">
            {user.author?.displayName || t("discover.unnamed")}
          </AppText>
        </a>
        <Button
          title={user.following ? t("discover.following") : t("discover.follow")}
          variant={user.following ? "secondary" : "primary"}
          size="sm"
          fullWidth={false}
          onPress={onFollow}
          testId="explore-follow"
        />
      </div>
    </Card>
  );
}
