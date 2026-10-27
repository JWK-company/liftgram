"use client";
// @plm SRS-007  피드 탭 — app의 features/social/FeedTabScreen.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
//   머리   제목 + 검색·DM·알림(기본색 아이콘 셋 — SRS-054 시안 08. 저장함은 프로필로, 사람 찾기는 「발견」 탭으로)
//   갈래   팔로잉 / 발견 밑줄 탭. 팔로잉이 비면 그 자리에 발견(사람 찾기)을 곧바로 보여 준다
//   작성   + 버튼 → 전체 화면 작성기(결정 D5) — 피드는 읽기에 집중하고, 쓸 때만 작성기를 연다
//   목록   PostCard들 · 스크롤 끝에서 다음 페이지
//
// ── 로그인 ──────────────────────────────────────────────────────────────────
// 이 탭만은 **로그인이 있어야 뜻이 있다** — "누구를 팔로우하는가"가 없으면 피드가 정의되지 않는다.
// 나머지 화면(운동·기록·통계)은 계정 없이 그대로 돈다(ADR-002). 그래서 여기서는 막지 않고
// **안내하고 프로필로 보낸다.**
//
// ── 페이지 넘김 ─────────────────────────────────────────────────────────────
// 커서는 서버가 준 것을 그대로 되돌려 준다(직접 만들지 않는다). 새로고침이 끼어들면 그 전에
// 시작된 페이지 요청의 결과는 **버린다** — 안 그러면 옛 페이지가 새 목록 뒤에 붙는다.
// ─────────────────────────────────────────────────────────────────────────────
import { navigate } from "@/lib/nav";
import type { GearTag, WeightUnit } from "@app/core";
import type { Cursor, Post, StoryGroup } from "@app/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { feedClient, feedErrorMessage, isUnauthenticated } from "@/lib/feedClient";
import { uploadImage } from "@/lib/mediaClient";
import { notificationClient } from "@/lib/dmClient";
import { storyClient } from "@/lib/storyClient";
import { useAuth } from "../AuthProvider";
import { useToast } from "../Toast";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { TextArea } from "../ui/inputs";
import { ListState } from "../ui/ListState";
import { AppText, EmptyState } from "../ui/primitives";
import { ScreenHeader } from "../ui/ScreenHeader";
import { AppBar } from "../ui/AppBar";
import { UnderlineTabs } from "../ui/rows";
import DiscoverClient from "./DiscoverClient";
import { GearTagPicker } from "./GearTagPicker";
import { ImagePicker } from "./ImagePicker";
import { GearSource, GearCategory as GearCategoryEnum } from "@app/contracts";
import { StoryTray } from "./StoryTray";
import { StoryViewer } from "./StoryViewer";
import { loadStorySeen, markSeen, type StorySeenMap } from "./storySeen";
import { InfiniteSentinel } from "./InfiniteSentinel";
import { PostCard } from "./PostCard";
import { useWeightUnit } from "./useWeightUnit";

/** 도메인 문자열 → 계약 enum. 글을 올릴 때만 쓴다. */
function gearCategoryEnum(c: GearTag["category"]): GearCategoryEnum {
  switch (c) {
    case "wristWrap":
      return GearCategoryEnum.WRIST_WRAP;
    case "strap":
      return GearCategoryEnum.STRAP;
    case "belt":
      return GearCategoryEnum.BELT;
    case "kneeSleeve":
      return GearCategoryEnum.KNEE_SLEEVE;
    case "gloves":
      return GearCategoryEnum.GLOVES;
    case "shoes":
      return GearCategoryEnum.SHOES;
    case "chalk":
      return GearCategoryEnum.CHALK;
    case "armSleeve":
      return GearCategoryEnum.ARM_SLEEVE;
  }
}

export default function FeedClient() {
  const { user, loading: authLoading } = useAuth();
  const unit = useWeightUnit();
  const toast = useToast();

  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<Cursor | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [caption, setCaption] = useState("");
  const [picked, setPicked] = useState<File | null>(null);
  const [gear, setGear] = useState<GearTag[]>([]);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 사진은 올렸는데 글쓰기가 실패한 경우, 재시도에서 **같은 사진을 다시 올리지 않는다**
  // (저장소에 고아 파일이 쌓이고 용량만 먹는다 — app이 같은 이유로 캐시를 둔다).
  const uploaded = useRef<{ file: File; url: string } | null>(null);

  // 스토리 — 트레이·뷰어·열람 표시. 열람은 서버가 모른다(기기에 남는다).
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [viewing, setViewing] = useState<StoryGroup | null>(null);
  const [seen, setSeen] = useState<StorySeenMap>({});
  const [storyBusy, setStoryBusy] = useState(false);
  // 안 읽은 알림 수 — 머리의 배지.
  const [unread, setUnread] = useState(0);
  const [tab, setTab] = useState<"following" | "discover">("following");
  const [composing, setComposing] = useState(false);

  // 새로고침 세대 — 이 값이 바뀌면 진행 중이던 페이지 요청의 결과는 버린다.
  const gen = useRef(0);

  const load = useCallback(async () => {
    const mine = ++gen.current;
    setLoading(true);
    setLoadError(false);
    try {
      // 스토리는 **따로 실패해도 된다** — 트레이가 비어도 피드는 읽을 수 있어야 한다.
      void storyClient()
        .listActiveStories({})
        .then((r) => {
          if (mine === gen.current) setGroups(r.groups);
        })
        .catch(() => {});
      // 알림 수도 곁들여 읽는다 — 실패해도 피드는 그대로 뜬다.
      void notificationClient()
        .unreadCount({})
        .then((r) => {
          if (mine === gen.current) setUnread(r.count);
        })
        .catch(() => {});

      const res = await feedClient().listFeed({});
      if (mine !== gen.current) return;
      setPosts(res.posts);
      setCursor(res.nextCursor);
    } catch (e) {
      if (mine !== gen.current) return;
      // 로그인하지 않은 것은 "오류"가 아니다 — 아래에서 안내 화면을 그린다.
      if (!isUnauthenticated(e)) setLoadError(true);
    } finally {
      if (mine === gen.current) setLoading(false);
    }
  }, []);

  // 직전 사용자(캐시)가 있으면 세션 확인을 기다리지 않고 바로 받는다(SRS-054) — 갱신은 전송 계층이 한 번만 돈다
  // (AuthProvider 의 복원과 같은 약속을 나눠 쓴다). 사용자 **id** 가 바뀔 때만 다시 받는다(확인 뒤 같은 사람이면 그대로).
  const userId = user?.id ?? null;
  useEffect(() => {
    if (userId) void load();
  }, [userId, load]);
  useEffect(() => {
    if (!authLoading && !userId) setLoading(false);
  }, [authLoading, userId]);

  // 열람 표시는 기기에 있다 — 화면이 뜰 때 한 번 읽는다.
  useEffect(() => setSeen(loadStorySeen()), []);

  function openStory(g: StoryGroup) {
    setViewing(g);
    // 여는 순간 "봤다"로 친다 — 강조 링이 곧바로 풀린다(app과 같다).
    setSeen((prev) => markSeen(g, prev));
  }

  async function addStory(file: File) {
    if (storyBusy) return;
    setStoryBusy(true);
    try {
      const url = await uploadImage(file);
      const res = await storyClient().createStory({ mediaUrl: url });
      const list = await storyClient().listActiveStories({});
      setGroups(list.groups);
      // 자동 스캔에 걸린 사진은 올라가도 **트레이에 안 뜬다** — 성공으로 오인하지 않게 갈라 말한다.
      toast(res.pending ? t("story.pending") : t("story.uploaded"));
    } catch (e) {
      toast(feedErrorMessage(e), "error");
    } finally {
      setStoryBusy(false);
    }
  }

  const loadMore = useCallback(async () => {
    if (loadingMore || !cursor || !posts.length) return;
    const mine = gen.current;
    setLoadingMore(true);
    try {
      const res = await feedClient().listFeed({ cursor });
      if (mine !== gen.current) return; // 그사이 새로고침됨 → 옛 페이지는 버린다
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...res.posts.filter((p) => !seen.has(p.id))];
      });
      setCursor(res.nextCursor);
    } catch {
      // 다음 페이지 실패는 조용히 둔다 — 이미 보이는 목록은 그대로 쓸 수 있다.
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, posts.length]);

  async function submit() {
    const text = caption.trim();
    // 할 말도 사진도 없으면 글이 아니다(서버도 같은 판단을 한다).
    if ((!text && !picked) || posting) return;
    setPosting(true);
    setError(null);
    try {
      let mediaUrls: string[] = [];
      if (picked) {
        const url = uploaded.current?.file === picked ? uploaded.current.url : await uploadImage(picked);
        uploaded.current = { file: picked, url };
        mediaUrls = [url];
      }
      const res = await feedClient().createPost({
        caption: text,
        mediaUrls,
        gear: gear.map((g) => ({
          category: gearCategoryEnum(g.category),
          source: GearSource.USER,
          brand: g.brand ?? "",
          note: g.note ?? "",
        })),
      });
      if (res.post) setPosts((prev) => [res.post as Post, ...prev]);
      setCaption("");
      setPicked(null);
      setGear([]);
      uploaded.current = null; // 글이 올라갔으니 캐시는 버린다
      // 작성기를 닫고 방금 쓴 글이 보이는 팔로잉 목록으로 돌아간다. 실패하면 작성기를 연 채로 오류를 보인다.
      setComposing(false);
      setTab("following");
    } catch (e) {
      setError(feedErrorMessage(e));
    } finally {
      setPosting(false);
    }
  }

  const replace = useCallback((next: Post) => {
    setPosts((prev) => prev.map((p) => (p.id === next.id ? next : p)));
  }, []);

  const drop = useCallback((id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // 로그인하지 않았을 때 — 막는 대신 어디로 가면 되는지 알려 준다.
  if (!authLoading && !user) {
    return (
      <div className="flex flex-1 flex-col">
        <ScreenHeader title={t("feed.title")} />
        <div className="flex flex-1 flex-col p-[var(--spacing-lg)]">
          <EmptyState
            icon="person-circle-outline"
            title={t("feed.loginRequiredTitle")}
            message={t("feed.loginRequiredMessage")}
            action={
              <Button
                title={t("feed.goProfile")}
                icon="person-circle-outline"
                fullWidth={false}
                onPress={() => {
                  navigate("/account");
                }}
                testId="feed-go-profile"
              />
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <AppBar
        title={t("feed.title")}
        actions={
          <>
            <HeadIcon
              href="/explore"
              label={t("explore.title")}
              icon="search-outline"
              testId="feed-explore"
            />
            <HeadIcon
              href="/messages"
              label={t("dm.title")}
              icon="chatbubbles-outline"
              testId="feed-messages"
            />
            <HeadIcon
              href="/notifications"
              label={t("notif.title")}
              icon="notifications-outline"
              testId="feed-notifications"
              badge={
                unread > 0 ? (
                  <span
                    data-testid="feed-unread-badge"
                    className="absolute top-1.5 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--color-brand) px-[3px] font-bold text-(--color-on-brand) text-[9px]"
                  >
                    {unread > 9 ? "9+" : String(unread)}
                  </span>
                ) : null
              }
            />
          </>
        }
      />

      <UnderlineTabs
        testId="feed-tabs"
        value={tab}
        onChange={setTab}
        items={[
          { value: "following", label: "팔로잉", testId: "feed-following" },
          { value: "discover", label: "발견", testId: "feed-discover" },
        ]}
      />

      {tab === "discover" ? (
        <DiscoverClient embedded />
      ) : (
        <>
          <StoryTray
            groups={groups}
            meId={user?.id ?? null}
            seen={seen}
            busy={storyBusy}
            onOpen={openStory}
            onAdd={addStory}
          />

          <div className="flex-1 p-[var(--spacing-lg)] pt-[var(--spacing-md)]" data-testid="feed-list">
            {posts.length === 0 ? (
              <>
                <ListState
                  loading={loading}
                  error={loadError}
                  onRetry={load}
                  skeletonVariant="post"
                  emptyIcon="newspaper-outline"
                  emptyTitle="feed.emptyTitle"
                  emptyMessage="feed.emptyMessage"
                />
                {/* 팔로잉이 비면 그 자리에서 사람을 찾게 한다(시안 08) — 다른 화면으로 보내지 않는다. */}
                {!loading && !loadError ? (
                  <div
                    className="-mx-[var(--spacing-lg)] mt-[var(--spacing-md)]"
                    data-testid="feed-empty-discover"
                  >
                    <DiscoverClient embedded />
                  </div>
                ) : null}
              </>
            ) : (
              <>
                {posts.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    meId={user?.id ?? null}
                    unit={unit as WeightUnit}
                    onChanged={replace}
                    onDeleted={drop}
                  />
                ))}
                <InfiniteSentinel onReach={loadMore} disabled={!cursor} />
              </>
            )}
          </div>
        </>
      )}

      {/* + 버튼 — 탭바 위 오른쪽. 넓은 화면에서도 앱 폭(560) 안쪽에 붙는다. */}
      <button
        type="button"
        aria-label={t("feed.post")}
        data-testid="feed-compose"
        onClick={() => setComposing(true)}
        // 운동 중 막대가 떠 있으면 그 높이만큼 위로 — 막대 밑에 깔려 눌리지 않던 것 @plm SRS-066
        className="fixed right-[max(16px,calc(50vw-264px))] bottom-[calc(76px+var(--shell-workout-bar,0px)+env(safe-area-inset-bottom))] z-30 flex h-14 w-14 lg:bottom-[calc(24px+var(--shell-workout-bar,0px))] items-center justify-center rounded-full bg-(--color-brand) shadow-lg active:opacity-80"
      >
        <Icon name="add" size={28} color="var(--color-on-brand)" />
      </button>

      {composing ? (
        // 전체 화면 작성기 — 장비·사진 시트(z-50)가 이 위로 뜨도록 한 단 낮게 둔다.
        <div
          role="dialog"
          aria-modal="true"
          aria-label="새 글"
          data-testid="feed-composer"
          className="fixed inset-0 z-[45] flex justify-center bg-(--color-bg)"
        >
          <div className="flex w-full max-w-[560px] flex-col bg-(--color-surface)">
            <header className="flex min-h-14 items-center border-(--color-line) border-b px-[var(--spacing-xs)]">
              <button
                type="button"
                aria-label="닫기"
                data-testid="composer-close"
                onClick={() => setComposing(false)}
                className="flex h-11 w-11 items-center justify-center"
              >
                <Icon name="close" size={24} color="var(--color-ink)" />
              </button>
              <h1 className="flex-1 text-center font-semibold text-[length:var(--text-md)]">새 글</h1>
              <div className="pr-[var(--spacing-sm)]">
                <Button
                  title={posting ? t("feed.uploading") : t("feed.post")}
                  size="sm"
                  loading={posting}
                  disabled={!caption.trim() && !picked}
                  fullWidth={false}
                  onPress={submit}
                  testId="feed-post"
                />
              </div>
            </header>
            <div className="flex-1 overflow-y-auto px-[var(--spacing-lg)] pt-[var(--spacing-md)] pb-[var(--spacing-xl)]">
              <TextArea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={t("feed.composePlaceholder")}
                testId="feed-caption"
                rows={6}
                className="mb-[var(--spacing-sm)]!"
              />
              {/* 착용장비 태그 — 선택 칩 미리보기 + 목록 시트 */}
              <GearTagPicker value={gear} onChange={setGear} disabled={posting} />
              <ImagePicker file={picked} onPick={setPicked} disabled={posting} />
              {error ? (
                <div className="mt-[var(--spacing-sm)]">
                  <AppText variant="caption" color="danger" data-testid="feed-error">
                    {error}
                  </AppText>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <StoryViewer group={viewing} meId={user?.id ?? null} onClose={() => setViewing(null)} />
    </div>
  );
}

/** 피드 머리 아이콘 — 기본 글자색(붉은 아이콘은 「눌러야 할 것」 처럼 보였다 · 시안 08). */
function HeadIcon({
  href,
  label,
  icon,
  testId,
  badge,
}: {
  href: string;
  label: string;
  icon: Parameters<typeof Icon>[0]["name"];
  testId: string;
  badge?: React.ReactNode;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      data-testid={testId}
      className="relative flex h-11 w-11 items-center justify-center rounded-full active:opacity-60"
    >
      <Icon name={icon} size={23} color="var(--color-ink)" />
      {badge}
    </a>
  );
}
