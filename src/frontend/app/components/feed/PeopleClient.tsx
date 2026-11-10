"use client";
// 사람 화면(SPEC-048 Phase 1 · S-18) — 피드 머리 👤 로 들어온다.
//
// 맨 위 이름 찾기(지금의 사람 찾기와 같은 SearchUsers), 검색어가 없으면 「팔로잉」·「팔로워」 두 탭.
// 줄마다 「메시지」 — 그 사람과의 1:1 대화를 바로 연다(팔로우와 무관 · 차단한 사이는 서버가 막는다).
// 탭은 주소 ?tab=followers 로 남긴다(뒤로·새로고침에도 같은 탭). 서버는 목록을 50명까지만 준다(다음 쪽 없음).
import type { UserResult } from "@app/contracts";
import { FollowListMode, routes } from "@app/contracts";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { dmClient } from "@/lib/dmClient";
import { feedClient, feedErrorMessage } from "@/lib/feedClient";
import { t } from "@/lib/i18n";
import { navigate } from "@/lib/nav";
import { useAuth } from "../AuthProvider";
import { CoachBadge } from "../coaching/CoachBits";
import { useToast } from "../Toast";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/inputs";
import { ListState } from "../ui/ListState";
import { AppText, EmptyState } from "../ui/primitives";
import { UnderlineTabs } from "../ui/rows";
import { ScreenHeader } from "../ui/ScreenHeader";

type Tab = "following" | "followers";
/** 서버가 ListFollows 를 자르는 수(src/backend/internal/feed/service.go) — 이만큼 오면 「나머지는 검색」 안내 */
const FOLLOW_CAP = 50;

export default function PeopleClient() {
  const { user, loading: authLoading } = useAuth();
  const meId = user?.id ?? null;
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get("tab") === "followers" ? "followers" : "following");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
    },
    [],
  );
  const toast = useToast();
  const q = query.trim();

  // 검색어가 없으면 내 목록(탭), 있으면 이름 찾기(300ms 멈춘 뒤). 늦게 온 옛 응답은 버린다 — 탭을 빨리 바꿔도
  // 팔로잉 응답이 팔로워 탭에 그려지지 않게(/qa code).
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry 는 「다시 시도」 신호다
  useEffect(() => {
    // 신원이 정해진 뒤에 부른다 — 새로고침 직후 먼저 쏘면 토큰 갱신이 다른 곳과 겹친다(ConversationsClient 와 같은 규칙)
    if (authLoading || !meId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    setUsers([]);
    const timer = setTimeout(
      async () => {
        try {
          const res = q
            ? await feedClient().searchUsers({ query: q })
            : await feedClient().listFollows({
                userId: meId,
                mode: tab === "following" ? FollowListMode.FOLLOWING : FollowListMode.FOLLOWERS,
                limit: FOLLOW_CAP,
              });
          if (!cancelled) setUsers(res.users);
        } catch {
          if (!cancelled) setError(true);
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
  }, [authLoading, meId, q, tab, retry]);

  function switchTab(next: Tab) {
    setTab(next);
    // 주소에 남긴다(뒤로·새로고침에도 같은 탭) — 기록을 쌓지 않게 replace
    const url = next === "followers" ? "/people?tab=followers" : "/people";
    window.history.replaceState(window.history.state, "", url);
  }

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
    } catch (e) {
      setUsers((prev) => prev.map((x) => (x.author?.id === id ? ({ ...x, following } as UserResult) : x)));
      toast(feedErrorMessage(e), "error");
    }
  }

  async function openDirect(userId: string) {
    if (opening) return; // 연타해도 방은 하나 — 서버도 같은 두 사람이면 같은 방을 준다
    setOpening(userId);
    try {
      const res = await dmClient().getOrCreateDirect({ userId });
      if (res.conversation) {
        navigate(routes.conversation(res.conversation.id));
        // 이동이 미뤄지거나 무시돼도 버튼이 영영 잠기지 않게
        releaseTimer.current = setTimeout(() => setOpening(null), 8_000);
      } else setOpening(null);
    } catch (e) {
      toast(feedErrorMessage(e), "error");
      setOpening(null);
    }
  }

  const header = (
    <ScreenHeader
      title={t("people.title")}
      back={
        <a href="/feed" aria-label={t("feed.title")} data-testid="people-back">
          <Icon name="chevron-back" size={24} color="var(--color-ink)" />
        </a>
      }
    />
  );

  // 로그인 전 — 피드와 같은 안내
  if (!authLoading && !user) {
    return (
      <div className="flex flex-1 flex-col">
        {header}
        <div className="flex flex-1 flex-col p-[var(--spacing-lg)]" data-testid="people-login">
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
                testId="people-go-login"
              />
            }
          />
        </div>
      </div>
    );
  }

  const capped = !q && !loading && users.length >= FOLLOW_CAP;

  return (
    <div className="flex flex-1 flex-col">
      {header}
      <div className="px-[var(--spacing-lg)] pt-[var(--spacing-md)]">
        <TextField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("discover.searchPlaceholder")}
          testId="people-query"
        />
      </div>
      {q ? null : (
        <UnderlineTabs
          testId="people-tabs"
          value={tab}
          onChange={switchTab}
          items={[
            { value: "following", label: t("profile.following"), testId: "people-tab-following" },
            { value: "followers", label: t("profile.followers"), testId: "people-tab-followers" },
          ]}
        />
      )}
      <div className="flex-1 p-[var(--spacing-lg)] pt-[var(--spacing-md)]" data-testid="people-list">
        {users.length === 0 ? (
          <ListState
            loading={loading || authLoading}
            error={error}
            onRetry={() => setRetry((n) => n + 1)}
            skeletonVariant="row"
            emptyIcon={q ? "search-outline" : "people-outline"}
            emptyTitle={
              q ? "discover.empty" : tab === "following" ? "people.emptyFollowing" : "people.emptyFollowers"
            }
            emptyMessage={q ? "discover.emptyMessage" : "people.emptyHint"}
          />
        ) : (
          <>
            <div
              // [원본] className="overflow-hidden rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-card) [&>*+*]:border-(--color-line) [&>*+*]:border-t"
              // [개선] 평평한 기록지(SPEC-056 F1) — 판 없이 위·아래 가는 선과 줄 사이 선만(ListGroup 과 같은 모양)
              className="overflow-hidden border-(--color-line) border-y [&>*+*]:border-(--color-line) [&>*+*]:border-t"
            >
              {users.map((u) => {
                const id = u.author?.id ?? "";
                return (
                  <div
                    key={id}
                    data-testid="people-row"
                    // [원본] className="flex items-center gap-[var(--spacing-sm)] px-[var(--spacing-md)] py-[var(--spacing-sm)]"
                    // [개선] SPEC-056 — 판이 없으니 줄 안쪽 좌우는 화면 여백에 맞춰 좁게(ListRow 와 같은 px-xs)
                    className="flex items-center gap-[var(--spacing-sm)] px-[var(--spacing-xs)] py-[var(--spacing-sm)]"
                  >
                    <a
                      href={routes.userProfile(id)}
                      className="flex min-h-[44px] min-w-0 flex-1 items-center gap-[var(--spacing-sm)]"
                      data-testid="people-user"
                    >
                      <Avatar name={u.author?.displayName} url={u.author?.avatarUrl} size={36} />
                      <AppText variant="body" className="block min-w-0 flex-1 truncate font-medium!">
                        {u.author?.displayName || t("discover.unnamed")}
                      </AppText>
                      {/* 코치 배지(SPEC-050) — 이름 옆, 이름이 길면 이름이 줄어든다 */}
                      {/* [원본] {u.trainerIntent ? <CoachBadge … /> : null} — SPEC-052: 배지는 파생값(활성 연결의 코치) */}
                      {u.isCoach ? <CoachBadge testId="people-coach-badge" /> : null}
                    </a>
                    {/* 팔로우하지 않은 사람만 「팔로우」(팔로워 탭에서는 맞팔) — 팔로잉 해제는 프로필에서 */}
                    {u.following ? null : (
                      <button
                        type="button"
                        aria-label={t("discover.follow")}
                        title={t("discover.follow")}
                        data-testid="people-follow"
                        onClick={() => void toggleFollow(u)}
                        // [원본] className="… rounded-full bg-(--color-brand) …" + 흰 아이콘 — 줄마다 빨강 채움 원이 되풀이됐다
                        // [개선] SPEC-056 F4·F5 — 판 없이 빨강 아이콘만(누르는 자리 44px 그대로)
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:opacity-60"
                      >
                        <Icon name="person-add-outline" size={22} color="var(--color-brand)" />
                      </button>
                    )}
                    <Button
                      title={t("people.message")}
                      // [원본] variant="outline" — 줄마다 빨강 테두리가 되풀이됐다 · [개선] 중립 테두리(SPEC-056 F4)
                      variant="secondary"
                      size="sm"
                      fullWidth={false}
                      loading={opening === id}
                      disabled={!!opening}
                      onPress={() => void openDirect(id)}
                      testId="people-message"
                      className="min-h-11 shrink-0"
                    />
                  </div>
                );
              })}
            </div>
            {capped ? (
              <AppText
                variant="caption"
                color="textFaint"
                className="mt-[var(--spacing-sm)] block text-center"
                data-testid="people-capped"
              >
                {t("people.capped", { count: FOLLOW_CAP })}
              </AppText>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
