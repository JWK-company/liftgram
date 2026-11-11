"use client";
// @plm SRS-008  공개 프로필 — app의 features/social/UserProfileScreen.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
//   머리   아바타 · 이름 · 글/팔로워/팔로잉(눌러서 목록) · 팔로우/차단 버튼
//   목록   그 사람의 글(내가 볼 수 있는 것만 — 판정은 서버가 한다)
//
// 차단은 되돌릴 수 있지만 관계를 끊는다(팔로우가 양쪽 다 사라진다). 그래서 확인창을 세운다.
// 내가 차단한 사람의 프로필은 **보인다** — 해제 버튼이 여기 있어야 하기 때문이다.
//
// 코칭 v2(SPEC-050 P1b): 상대가 코치(trainer_intent)면 이름 옆 「코치」 배지 · 소개 · 태그.
// 버튼 줄 아래 한 줄 — 「코칭 요청」(상대가 코치 · 범위 시트) / 「코칭 초대」(내가 코치 · 상대는 코치 아님) /
// 이미 연결돼 있으면 「코칭 중」. 판단은 관계 목록(ListGrants)을 다 읽은 뒤에만 그린다(깜빡임 금지).
// [개선] SPEC-052 — 「트레이너」 역할이 없다. 배지는 파생값(isCoach — 활성 연결의 코치) · 소개·태그는 노출을 켠 사람만
//   (trainerIntent) · 연결이 없으면 누구에게나 두 버튼 「코치로 요청」·「내 회원으로 초대」(내게 코치가 있으면 요청 자리에 안내).
// ─────────────────────────────────────────────────────────────────────────────
import { navigate } from "@/lib/nav";
import type { WeightUnit } from "@app/core";
import {
  GrantStatus,
  Side,
  routes,
  type Cursor,
  type Grant,
  type Post,
  type SocialProfile,
} from "@app/contracts";
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
import { MoreMenu } from "../ui/MoreMenu";
import { InfiniteSentinel } from "./InfiniteSentinel";
import { PostCard } from "./PostCard";
import { useWeightUnit } from "./useWeightUnit";
import { coachingClient } from "@/lib/coachingClient";
import type { ScopeValue } from "@/lib/coaching";
import { errorText } from "@/lib/errorText";
import { useToast } from "../Toast";
import { CoachBadge, CoachCard, CoachingActiveBadge, CoachTags } from "../coaching/CoachBits";
import { CoachingScopeSheet } from "../coaching/CoachingScopeSheet";
import { ConfirmDialog } from "../ui/Dialog";

export default function UserProfileClient({ userId }: { userId: string }) {
  const { user } = useAuth();
  const unit = useWeightUnit();

  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<Cursor | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  // 코칭(SPEC-050) — 이 사람과의 관계(undefined = 아직 읽는 중 · null = 없음) · 범위 시트
  const [grant, setGrant] = useState<Grant | null | undefined>(undefined);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [coachBusy, setCoachBusy] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  // 관계 목록 읽기 실패면 코칭 줄을 그리지 않는다(없는 줄 알고 요청·초대를 띄우지 않게 · 코드 리뷰 지적 8)
  const [grantsError, setGrantsError] = useState(false);
  // 내가 회원으로 이미 다른 코치와 연결돼 있나 — 그러면 「코칭 요청」 대신 안내(서버가 거절하기 전에, 시트를 열기 전에)
  const [hasCoach, setHasCoach] = useState(false);
  const [confirmInvite, setConfirmInvite] = useState(false);
  const meId = user?.id ?? null;

  const loadGrant = useCallback(async () => {
    if (!meId) {
      setGrant(null);
      return;
    }
    try {
      const res = await coachingClient().listGrants({});
      setGrantsError(false);
      setHasCoach(
        res.grants.some(
          (g) => g.roleOfMe === Side.MEMBER && g.status === GrantStatus.ACTIVE && g.peer?.id !== userId,
        ),
      );
      setGrant(res.grants.find((g) => g.peer?.id === userId && g.status !== GrantStatus.REVOKED) ?? null);
    } catch {
      setGrantsError(true);
      setGrant(null);
    }
  }, [meId, userId]);

  useEffect(() => {
    void loadGrant();
  }, [loadGrant]);

  /** 회원이 코치에게(범위·한 줄) · 코치가 회원에게(범위는 회원이 수락할 때 고른다). */
  async function requestCoaching(as: "member" | "trainer", scope?: ScopeValue, note = "") {
    if (coachBusy) return;
    setCoachBusy(true);
    setCoachError(null);
    try {
      if (as === "member") await coachingClient().requestCoaching({ trainerId: userId, scope, note });
      else await coachingClient().requestCoaching({ memberId: userId });
      toast(as === "member" ? t("coaching.requestSent") : t("coaching.inviteSent"));
      setScopeOpen(false);
      await loadGrant();
    } catch (e) {
      if (as === "member") setCoachError(errorText(e));
      else toast(errorText(e), "error");
    } finally {
      setCoachBusy(false);
    }
  }

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
      if (res.conversation) navigate(`/messages/${res.conversation.id}`);
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
      <ScreenHeader
        title={name}
        back={<BackToFeed />}
        right={
          profile && !profile.isSelf && !profile.isBlocked ? (
            <MoreMenu
              testId="profile-menu"
              sheetTestId="profile-menu-sheet"
              options={[
                {
                  label: t("profile.block"),
                  destructive: true,
                  testId: "profile-block",
                  onPress: toggleBlock,
                },
              ]}
            />
          ) : null
        }
      />

      <div className="flex-1 p-[var(--spacing-lg)]">
        {profile ? (
          // 내 프로필(시안 09)과 같은 머리: 왼쪽 아바타 · 오른쪽 이름과 숫자 셋 → 아래 팔로우·메시지.
          // 차단은 화면에 늘 드러내지 않고 머리의 ⋯ 안에 둔다(위험 동작 규칙).
          <div className="pb-[var(--spacing-lg)]" data-testid="profile-header">
            <div className="flex items-center gap-[var(--spacing-lg)]">
              <Avatar name={name} url={profile.author?.avatarUrl} size={72} />
              <div className="min-w-0 flex-1">
                {/* [원본] 이름 한 줄 — 코치면 옆에 「코치」 배지(SPEC-050) */}
                <div className="flex min-w-0 items-center gap-[var(--spacing-xs)]">
                  <AppText variant="heading" data-testid="profile-name" className="block min-w-0 truncate">
                    {name}
                  </AppText>
                  {/* [원본] {profile.trainerIntent ? <CoachBadge testId="profile-coach-badge" /> : null} */}
                  {profile.isCoach ? <CoachBadge testId="profile-coach-badge" /> : null}
                </div>
                <div className="mt-[var(--spacing-sm)] flex gap-[var(--spacing-xl)]">
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
              </div>
            </div>

            {/* 코치 소개·태그(SPEC-050) */}
            {profile.trainerIntent && (profile.coachBio || profile.coachTags.length > 0) ? (
              <div className="mt-[var(--spacing-md)] flex flex-col gap-[var(--spacing-xs)]">
                {profile.coachBio ? (
                  <AppText
                    variant="body"
                    color="textMuted"
                    className="block break-words"
                    data-testid="profile-coach-bio"
                  >
                    {profile.coachBio}
                  </AppText>
                ) : null}
                <CoachTags tags={profile.coachTags} testId="profile-coach-tags" />
              </div>
            ) : null}

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
            )}
            {profile.isSelf || profile.isBlocked || !user || grantsError ? null : (
              <CoachingLine
                grant={grant}
                hasCoach={hasCoach}
                peerAccepts={profile.trainerIntent} // 「코칭 요청 받기」를 켠 사람에게만 「코치로 요청」(SPEC-059 · 4a)
                // [원본] peerIsCoach={profile.trainerIntent} meIsCoach={!!user.trainerIntent} — 의향으로 둘 중 하나만
                busy={coachBusy}
                onRequest={() => {
                  setCoachError(null);
                  setScopeOpen(true);
                }}
                onInvite={() => setConfirmInvite(true)}
              />
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
      {scopeOpen && profile ? (
        <CoachingScopeSheet
          mode="request"
          header={
            <CoachCard
              name={name}
              avatarUrl={profile.author?.avatarUrl}
              // [원본] bio={profile.coachBio} tags={profile.coachTags}
              // [개선] SPEC-052 — 소개·태그는 노출을 켠 사람만(보이는 곳 규칙 하나) · 배지는 파생값
              bio={profile.trainerIntent ? profile.coachBio : undefined}
              tags={profile.trainerIntent ? profile.coachTags : undefined}
              coach={profile.isCoach}
              testId="scope-coach-card"
            />
          }
          busy={coachBusy}
          error={coachError}
          onConfirm={(scope, note) => void requestCoaching("member", scope, note)}
          onClose={() => setScopeOpen(false)}
        />
      ) : null}
      {confirmInvite && profile ? (
        <ConfirmDialog
          testId="profile-invite-confirm"
          // [원본] title={t("coaching.profile.inviteTitle")} — 「코칭 초대를 보낼까요?」(역할이 안 보였다 · REV-105 U4)
          title={t("coaching.profile.inviteTitle", { name })}
          message={t("coaching.profile.inviteMessage", { name })}
          confirmLabel={t("coaching.profile.invite")}
          onCancel={() => setConfirmInvite(false)}
          onConfirm={() => {
            setConfirmInvite(false);
            void requestCoaching("trainer");
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * 버튼 줄 아래 코칭 한 줄 — 보조 버튼(빨강 채움 아님). 관계를 읽는 동안은 자리만(44px) 잡아 두고 그리지 않는다.
 *   연결돼 있음 → 「코칭 중」 · 대기 → 「코칭 수락 대기」 · 상대가 코치 → 「코칭 요청」 · 내가 코치 → 「코칭 초대」
 */
// [원본] 상대·나의 의향(trainer_intent)으로 「코칭 요청」/「코칭 초대」 중 하나만 — SPEC-052 에서 둘 다로 바뀌었다.
// function CoachingLine({
//   grant,
//   hasCoach,
//   peerIsCoach,
//   meIsCoach,
//   busy,
//   onRequest,
//   onInvite,
// }: {
//   grant: Grant | null | undefined;
//   hasCoach: boolean;
//   peerIsCoach: boolean;
//   meIsCoach: boolean;
//   busy: boolean;
//   onRequest: () => void;
//   onInvite: () => void;
// }) {
//   if (!peerIsCoach && !meIsCoach) return null;
//   if (grant === undefined) return <div className="mt-[var(--spacing-sm)] h-11" aria-hidden />;
//   if (grant) {
//     const active = grant.status === GrantStatus.ACTIVE;
//     return (
//       <a
//         href="/coaching"
//         data-testid="profile-coaching-state"
//         className="mt-[var(--spacing-sm)] flex min-h-11 items-center justify-center gap-[var(--spacing-xs)] rounded-[var(--radius-sm)] bg-(--color-surface-alt)"
//       >
//         {active ? (
//           <CoachingActiveBadge testId="profile-coaching-active" />
//         ) : (
//           <AppText variant="caption" color="textMuted" className="font-semibold">
//             {t("coaching.profile.pending")}
//           </AppText>
//         )}
//       </a>
//     );
//   }
//   if (peerIsCoach && hasCoach) {
//     // 이미 코치가 있으면 요청을 막는다 — 버튼 대신 안내 한 줄(누르면 코칭 화면)
//     return (
//       <a
//         href="/coaching"
//         data-testid="profile-coaching-has-coach"
//         className="mt-[var(--spacing-sm)] flex min-h-11 items-center justify-center rounded-[var(--radius-sm)] bg-(--color-surface-alt) px-[var(--spacing-md)] py-[var(--spacing-xs)] text-center"
//       >
//         <AppText variant="caption" color="textMuted">
//           {t("coaching.profile.hasCoach")}
//         </AppText>
//       </a>
//     );
//   }
//   return (
//     <div className="mt-[var(--spacing-sm)]">
//       {peerIsCoach ? (
//         <Button
//           title={t("coaching.profile.request")}
//           icon="people-outline"
//           variant="secondary"
//           disabled={busy}
//           onPress={onRequest}
//           testId="profile-coaching-request"
//         />
//       ) : (
//         <Button
//           title={t("coaching.profile.invite")}
//           icon="people-outline"
//           variant="secondary"
//           loading={busy}
//           onPress={onInvite}
//           testId="profile-coaching-invite"
//         />
//       )}
//     </div>
//   );
// }

// [개선] SPEC-052 — 연결이 없으면 누구에게나 두 버튼(보조 · 같은 너비 · 아이콘 없음 — 360px·en 에서 한 줄 44px).
//   「코치로 요청」(나는 회원 · 범위 시트) · 「내 회원으로 초대」(나는 코치 · 확인창).
//   내게 이미 활성 코치가 있으면 요청 자리에 안내(누르면 코칭 화면)를 두고 초대는 남긴다(회원 한 명당 코치 한 명).
function CoachingLine({
  grant,
  hasCoach,
  peerAccepts,
  busy,
  onRequest,
  onInvite,
}: {
  grant: Grant | null | undefined;
  hasCoach: boolean;
  /** 상대가 「코칭 요청 받기」(trainer_intent)를 켰나 — 끄면 요청 버튼 대신 코드 안내(SPEC-059) */
  peerAccepts: boolean;
  busy: boolean;
  onRequest: () => void;
  onInvite: () => void;
}) {
  // [원본] h-11 — 버튼(48px)보다 4px 낮아 다 읽으면 밀렸다(REV-106 U8) · [개선] h-12 · 상태 줄도 같은 높이
  if (grant === undefined) return <div className="mt-[var(--spacing-sm)] h-12" aria-hidden />;
  if (grant) {
    const active = grant.status === GrantStatus.ACTIVE;
    return (
      <a
        href="/coaching"
        data-testid="profile-coaching-state"
        // [원본] className="… rounded-[var(--radius-sm)] bg-(--color-surface-alt)" — 회색 채움 막대
        // [개선] SPEC-056 F4 — 회색 채움 대신 secondary 와 같은 테두리(--color-line-strong) 버튼
        className="mt-[var(--spacing-sm)] flex min-h-12 items-center justify-center gap-[var(--spacing-xs)] rounded-[var(--radius-sm)] border border-(--color-line-strong)"
      >
        {active ? (
          <CoachingActiveBadge testId="profile-coaching-active" />
        ) : (
          <AppText variant="caption" color="textMuted" className="font-semibold">
            {t("coaching.profile.pending")}
          </AppText>
        )}
      </a>
    );
  }
  return (
    <div className="mt-[var(--spacing-sm)]" data-testid="profile-coaching-line">
      <div className="flex w-full gap-[var(--spacing-sm)]">
        {/* [원본] {hasCoach ? null : ( — 누구에게나 「코치로 요청」 */}
        {hasCoach || !peerAccepts ? null : (
          <div className="min-w-0 flex-1">
            <Button
              title={t("coaching.profile.request")}
              variant="secondary"
              disabled={busy}
              onPress={onRequest}
              testId="profile-coaching-request"
              className="px-[var(--spacing-sm)]!"
              truncate
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <Button
            title={t("coaching.profile.invite")}
            variant="secondary"
            loading={busy}
            onPress={onInvite}
            testId="profile-coaching-invite"
            // 360px 한 줄(REV-106 U1) — 좌우 여백을 줄이고 넘치면 … (글자는 그대로 읽힌다)
            className="px-[var(--spacing-sm)]!"
            truncate
          />
        </div>
      </div>
      {/* [원본] {hasCoach ? ( — 요청을 받지 않는 사람에게는 「이미 코치가 있어요」도 뜻이 없다(SPEC-059) */}
      {/* [원본 SPEC-059 1차] {peerAccepts && hasCoach ? ( — 이미 코치가 있으면 상대 설정과 상관없이 이 안내(코드로도 막힘 · REV-145 A6) */}
      {hasCoach ? (
        // 이미 코치가 있으면 요청을 막는다 — 버튼 대신 안내 한 줄(누르면 코칭 화면)
        <a
          href="/coaching"
          data-testid="profile-coaching-has-coach"
          // [원본] className="… rounded-[var(--radius-sm)] bg-(--color-surface-alt) …" — 회색 판 안내
          // [개선] SPEC-056 F4 — 판 없이 회색 안내 글자 한 줄(누르면 코칭 화면 · 누르는 자리 44px 그대로)
          className="mt-[var(--spacing-xs)] flex min-h-11 items-center justify-center px-[var(--spacing-md)] py-[var(--spacing-xs)] text-center underline decoration-(--color-line-strong) underline-offset-4"
        >
          <AppText variant="caption" color="textMuted">
            {t("coaching.profile.hasCoach")}
          </AppText>
        </a>
      ) : null}
      {peerAccepts || hasCoach ? null : (
        // 요청을 받지 않는 사람 — 버튼 대신 회색 한 줄(누르면 코칭 화면의 코드 칸 · SPEC-059 · REV-142 U10)
        <a
          href="/coaching"
          data-testid="profile-coaching-code-hint"
          className="mt-[var(--spacing-xs)] flex min-h-11 items-center justify-center px-[var(--spacing-md)] py-[var(--spacing-xs)] text-center underline decoration-(--color-line-strong) underline-offset-4"
        >
          <AppText variant="caption" color="textMuted">
            {t("profile.coachingCodeHint")}
          </AppText>
        </a>
      )}
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
