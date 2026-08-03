"use client";
// @plm SRS-007  게시물 카드 — app의 FeedTabScreen 안 PostCard를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
//   머리   아바타 · 이름 · 날짜 · [운동] 배지 · (내 글이면) 점 세 개 메뉴
//   운동   이름 · 총 볼륨/시간/세트 · 스트릭·PR 칩 · 종목 펼쳐보기 · 루틴 가져오기
//   본문   캡션(해시태그는 링크)
//   발     좋아요 · 댓글 · (오른쪽 끝) 저장
//
// ── 낙관적 갱신 ─────────────────────────────────────────────────────────────
// 좋아요·저장은 **누르는 즉시** 화면이 바뀌고 서버 응답으로 확정한다. 실패하면 되돌린다.
// 되돌릴 때는 캡처해 둔 절대값이 아니라 **원래 상태**로 되돌린다 — 그사이 목록이 새로고침돼
// 다른 사람의 좋아요가 반영됐다면, 절대값 복원이 그 변화를 지운다(app이 겪은 문제 그대로).
//
// ── 무게 단위 ───────────────────────────────────────────────────────────────
// 저장된 값은 항상 kg이고, 보는 사람의 단위로 그릴 때만 바꾼다. 이 카드는 계산하지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import type { WeightUnit } from "@app/core";
import { requiresAffiliateDisclosure } from "@app/core";
import { TargetType, routes, type Post } from "@app/contracts";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { feedClient } from "@/lib/feedClient";
import { mediaSrc } from "@/lib/mediaClient";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import { AppText, Card, Tag } from "../ui/primitives";
import { GearChips, GearDisclosure, readGearTags } from "./GearChips";
import { useGearConfig } from "./useGearConfig";
import { HashtagText } from "./HashtagText";
import { ReportSheet } from "../moderation/ReportSheet";
import { OwnPostMenu } from "./OwnPostMenu";
import { WorkoutBox } from "./WorkoutBox";

export function PostCard({
  post,
  meId,
  unit,
  onChanged,
  onDeleted,
}: {
  post: Post;
  meId: string | null;
  unit: WeightUnit;
  /** 좋아요·저장·수정처럼 이 카드 안에서 끝나는 변화. 목록이 자기 상태를 맞춘다. */
  onChanged: (next: Post) => void;
  onDeleted: (id: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [reporting, setReporting] = useState(false);
  // 카드가 직접 읽는다 — 화면마다 내려 주게 하면 한 군데를 빠뜨렸을 때 그 화면만 규칙이 달라진다.
  const gearConfig = useGearConfig();

  const isOwn = !!meId && post.author?.id === meId;
  // 태그는 도메인 정규화를 거쳐 읽는다(계약 밖의 값이 흘러들지 않게).
  const gearTags = readGearTags(post.gear);
  // **이 값이 곧 라벨을 그리는 조건식이다.** 아래 GearChips에 그대로 넘긴다 —
  // 다시 계산해 넘기면 게이트가 항진명제가 되어 라벨 없이도 링크가 열린다.
  const showDisclosure = gearTags.length > 0 && requiresAffiliateDisclosure(gearConfig);
  const name = post.author?.displayName || t("discover.unnamed");
  const when = post.createdAt
    ? new Date(Number(post.createdAt.seconds) * 1000).toLocaleDateString("ko-KR")
    : "";

  async function toggleLike() {
    if (pending) return; // 같은 카드 연타 방지 — 두 요청이 엇갈리면 수가 어긋난다
    setPending(true);
    const before = post;
    const liked = post.likedByMe;
    onChanged({ ...post, likedByMe: !liked, likeCount: post.likeCount + (liked ? -1 : 1) } as Post);
    try {
      const res = liked
        ? await feedClient().unlikePost({ postId: post.id })
        : await feedClient().likePost({ postId: post.id });
      onChanged({ ...post, likedByMe: res.likedByMe, likeCount: res.likeCount } as Post);
    } catch {
      onChanged(before);
    } finally {
      setPending(false);
    }
  }

  async function toggleBookmark() {
    const before = post;
    const saved = post.bookmarkedByMe;
    onChanged({ ...post, bookmarkedByMe: !saved } as Post);
    try {
      if (saved) await feedClient().unbookmarkPost({ postId: post.id });
      else await feedClient().bookmarkPost({ postId: post.id });
    } catch {
      onChanged(before);
    }
  }

  return (
    <Card className="mb-[var(--spacing-md)]">
      <div className="flex items-center gap-[var(--spacing-sm)]">
        <a
          href={routes.userProfile(post.author?.id ?? "")}
          className="flex min-w-0 flex-1 items-center gap-[var(--spacing-sm)]"
          data-testid="post-author"
        >
          <Avatar name={name} url={post.author?.avatarUrl} size={36} />
          <span className="min-w-0 flex-1">
            <AppText variant="body" className="block truncate font-medium!">
              {name}
            </AppText>
            <AppText variant="caption" color="textFaint">
              {when}
            </AppText>
          </span>
        </a>
        {post.workout ? <Tag label={t("feed.workoutBadge")} tone="primary" /> : null}
        {isOwn ? (
          <OwnPostMenu post={post} onUpdated={onChanged} onDeleted={onDeleted} />
        ) : meId ? (
          // 남의 글에는 신고. 로그인하지 않았으면 아무것도 두지 않는다(누를 수 없는 버튼은 두지 않는다).
          <button
            type="button"
            onClick={() => setReporting(true)}
            aria-label={t("report.title")}
            data-testid="post-report"
            className="pl-[var(--spacing-sm)]"
          >
            <Icon name="ellipsis-horizontal" size={18} color="var(--color-ink3)" />
          </button>
        ) : null}
      </div>

      {/* 대가성 고지 — 게시물 **첫 부분**(작성자명 바로 아래). 끝부분 표기는 폐지됐다(ADR-027 D6). */}
      {showDisclosure ? <GearDisclosure /> : null}

      {post.workout ? <WorkoutBox workout={post.workout} unit={unit} authorName={name} /> : null}

      {post.mediaUrls.length > 0 ? (
        // 정사각형 자리를 미리 잡아 둔다 — 사진이 늦게 오면 글이 아래로 밀려 읽던 자리를 잃는다.
        // biome-ignore lint/performance/noImgElement: 임의 출처(스토리지·CDN)의 사진 — 최적화 대상이 아니다
        <img
          src={mediaSrc(post.mediaUrls[0])}
          alt={post.caption || name}
          loading="lazy"
          data-testid="post-image"
          className="mt-[var(--spacing-sm)] aspect-square w-full rounded-[var(--radius-md)] bg-(--color-surface-alt) object-cover"
        />
      ) : null}

      {post.caption ? (
        <div className="mt-[var(--spacing-sm)]">
          <HashtagText text={post.caption} />
        </div>
      ) : null}

      {/* 장비 칩은 반드시 사진 **바깥** 아래다 — 사진을 가리는 클릭 유도는 제재 대상이다(ADR-027 D4). */}
      <GearChips postId={post.id} tags={gearTags} cfg={gearConfig} disclosureRendered={showDisclosure} />

      <div className="mt-[var(--spacing-md)] flex items-center gap-[var(--spacing-xl)]">
        <button
          type="button"
          onClick={toggleLike}
          data-testid="post-like"
          aria-pressed={post.likedByMe}
          aria-label={t("feed.workoutBadge")}
          className="flex items-center gap-[var(--spacing-xs)]"
        >
          <Icon
            name={post.likedByMe ? "heart" : "heart-outline"}
            size={22}
            color={post.likedByMe ? "var(--color-bad)" : "var(--color-ink2)"}
          />
          {post.likeCount > 0 ? (
            <AppText variant="caption" color="textMuted" data-testid="post-like-count">
              {String(post.likeCount)}
            </AppText>
          ) : null}
        </button>
        <a
          href={routes.postComments(post.id)}
          data-testid="post-comments"
          className="flex items-center gap-[var(--spacing-xs)]"
        >
          <Icon name="chatbubble-outline" size={20} color="var(--color-ink2)" />
          {post.commentCount > 0 ? (
            <AppText variant="caption" color="textMuted">
              {String(post.commentCount)}
            </AppText>
          ) : null}
        </a>
        <div className="flex-1" />
        <button
          type="button"
          onClick={toggleBookmark}
          data-testid="post-bookmark"
          aria-pressed={post.bookmarkedByMe}
          aria-label={t("bookmark.title")}
        >
          <Icon
            name={post.bookmarkedByMe ? "bookmark" : "bookmark-outline"}
            size={20}
            color={post.bookmarkedByMe ? "var(--color-brand)" : "var(--color-ink2)"}
          />
        </button>
      </div>

      {reporting ? (
        <ReportSheet targetType={TargetType.POST} targetId={post.id} onClose={() => setReporting(false)} />
      ) : null}
    </Card>
  );
}
