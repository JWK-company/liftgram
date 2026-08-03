"use client";
// @plm SRS-008  공개 프로필 — app의 features/social/UserProfileScreen.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
//   머리   아바타 · 이름 · 글/팔로워/팔로잉(눌러서 목록) · 팔로우/차단 버튼
//   목록   그 사람의 글(내가 볼 수 있는 것만 — 판정은 서버가 한다)
//
// 차단은 되돌릴 수 있지만 관계를 끊는다(팔로우가 양쪽 다 사라진다). 그래서 확인창을 세운다.
// 내가 차단한 사람의 프로필은 **보인다** — 해제 버튼이 여기 있어야 하기 때문이다.
// ─────────────────────────────────────────────────────────────────────────────
import type { WeightUnit } from "@app/core";
import { routes, type Cursor, type Post, type SocialProfile } from "@app/contracts";
import { useCallback, useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { dmClient } from "@/lib/dmClient";
import { feedClient, feedErrorMessage } from "@/lib/feedClient";
import { useAuth } from "../AuthProvider";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { ListState } from "../ui/ListState";
import { AppText, EmptyState } from "../ui/primitives";
import { ScreenHeader } from "../ui/ScreenHeader";
import { InfiniteSentinel } from "./InfiniteSentinel";
import { PostCard } from "./PostCard";
import { useWeightUnit } from "./useWeightUnit";

export default function UserProfileClient({ userId }: { userId: string }) {
  const { user } = useAuth();
  const unit = useWeightUnit();

  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<Cursor | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, ps] = await Promise.all([
        feedClient().getProfile({ userId }),
        feedClient().listUserPosts({ userId }),
      ]);
      setProfile(p.profile ?? null);
      setPosts(ps.posts);
      setCursor(ps.nextCursor);
    } catch (e) {
      setError(feedErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFollow() {
    if (!profile || busy) return;
    setBusy(true);
    const following = profile.isFollowing;
    // 카운트도 함께 움직인다 — 버튼만 바뀌고 숫자가 그대로면 반영이 안 된 것처럼 보인다.
    setProfile({
      ...profile,
      isFollowing: !following,
      followerCount: Math.max(0, profile.followerCount + (following ? -1 : 1)),
    } as SocialProfile);
    try {
      if (following) await feedClient().unfollow({ userId });
      else await feedClient().follow({ userId });
    } catch {
      setProfile(profile);
    } finally {
      setBusy(false);
    }
  }

  // 대화는 **찾거나 만든다** — 같은 상대를 몇 번 눌러도 같은 방으로 들어간다.
  async function message() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await dmClient().getOrCreateDirect({ userId });
      if (res.conversation) location.href = `/messages/${res.conversation.id}`;
    } catch (e) {
      setError(feedErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleBlock() {
    if (!profile || busy) return;
    setBusy(true);
    try {
      if (profile.isBlocked) await feedClient().unblockUser({ userId });
      else await feedClient().blockUser({ userId });
      // 차단은 팔로우까지 끊는다 — 화면 전체를 다시 읽어 정합을 맞춘다.
      await load();
    } catch (e) {
      setError(feedErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    if (!cursor) return;
    const res = await feedClient().listUserPosts({ userId, cursor });
    setPosts((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...res.posts.filter((p) => !seen.has(p.id))];
    });
    setCursor(res.nextCursor);
  }

  if (!loading && !profile) {
    return (
      <div className="flex flex-1 flex-col">
        <ScreenHeader title={t("profile.title")} back={<BackToFeed />} />
        <div className="flex flex-1 flex-col p-[var(--spacing-lg)]">
          <EmptyState
            tone="error"
            icon="cloud-offline-outline"
            title={t("profile.loadError")}
            message={error ?? t("common.loadErrorMessage")}
            action={<Button title={t("profile.retry")} icon="refresh" fullWidth={false} onPress={load} />}
          />
        </div>
      </div>
    );
  }

  const name = profile?.author?.displayName || t("discover.unnamed");

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title={name} back={<BackToFeed />} />

      <div className="flex-1 p-[var(--spacing-lg)]">
        {profile ? (
          <div className="flex flex-col items-center py-[var(--spacing-lg)]" data-testid="profile-header">
            <Avatar name={name} url={profile.author?.avatarUrl} size={84} />
            <div className="mt-[var(--spacing-md)]">
              <AppText variant="heading" data-testid="profile-name">
                {name}
              </AppText>
            </div>
            <div className="mt-[var(--spacing-lg)] flex gap-[var(--spacing-xxl)]">
              <Stat value={profile.postCount} label={t("profile.postsLabel")} />
              <Stat
                value={profile.followerCount}
                label={t("profile.followers")}
                href={routes.follows(userId, "followers")}
                testId="profile-followers"
              />
              <Stat
                value={profile.followingCount}
                label={t("profile.following")}
                href={routes.follows(userId, "following")}
                testId="profile-following"
              />
            </div>

            {profile.isSelf ? null : profile.isBlocked ? (
              <div className="mt-[var(--spacing-lg)] flex w-full gap-[var(--spacing-sm)]">
                <div className="flex-1">
                  <Button
                    title={t("profile.unblock")}
                    variant="secondary"
                    loading={busy}
                    onPress={toggleBlock}
                    testId="profile-unblock"
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="mt-[var(--spacing-lg)] flex w-full gap-[var(--spacing-sm)]">
                  <div className="flex-1">
                    <Button
                      title={profile.isFollowing ? t("discover.following") : t("discover.follow")}
                      variant={profile.isFollowing ? "secondary" : "primary"}
                      loading={busy}
                      onPress={toggleFollow}
                      testId="profile-follow"
                    />
                  </div>
                  <div className="flex-1">
                    <Button
                      title={t("profile.message")}
                      icon="chatbubble-ellipses-outline"
                      variant="secondary"
                      onPress={message}
                      testId="profile-message"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleBlock}
                  className="mt-[var(--spacing-md)]"
                  data-testid="profile-block"
                >
                  <AppText variant="caption" color="danger">
                    {t("profile.block")}
                  </AppText>
                </button>
              </>
            )}
          </div>
        ) : null}

        {posts.length === 0 ? (
          <ListState
            loading={loading}
            skeletonVariant="post"
            skeletonCount={3}
            emptyIcon="image-outline"
            emptyTitle="profile.noPosts"
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

function BackToFeed() {
  return (
    <a href="/feed" aria-label={t("feed.title")} data-testid="profile-back">
      <Icon name="chevron-back" size={24} color="var(--color-ink)" />
    </a>
  );
}

function Stat({
  value,
  label,
  href,
  testId,
}: {
  value: number;
  label: string;
  href?: string;
  testId?: string;
}) {
  const body = (
    <>
      <AppText variant="heading" className="block">
        {String(value)}
      </AppText>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
    </>
  );
  if (href) {
    return (
      <a href={href} data-testid={testId} className="flex flex-col items-center">
        {body}
      </a>
    );
  }
  return <div className="flex flex-col items-center">{body}</div>;
}
