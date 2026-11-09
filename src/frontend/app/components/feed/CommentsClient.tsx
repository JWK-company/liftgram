"use client";
// @plm SRS-007  글 보기 — /feed/<id> (공유 링크·앱 링크·댓글 알림이 오는 곳)
//
// ─────────────────────────────────────────────────────────────────────────────
//   글 카드 하나   💬 를 누르면 다른 화면과 같은 댓글 시트(CommentsSheet)가 아래에서 올라온다
//   ?comments=1    댓글 알림으로 왔으면 시트를 바로 연다(주소에서는 지운다 — 새로고침·뒤로 때 다시 뜨지 않게)
//
// [원본] 이 화면이 댓글 전체 화면이었다(목록·답글·입력칸 · 2026-11-09 위에 글 카드를 더했다).
// [개선 2026-11-09] 댓글은 어느 화면에서든 바닥 시트로 — 목록·답글·입력 로직은 CommentsSheet.tsx 로 옮겼다
// (옮기기 전 판은 git 기록 e288d7b 의 이 파일).
// ─────────────────────────────────────────────────────────────────────────────
import { Code, ConnectError } from "@connectrpc/connect";
import type { Post } from "@app/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { feedClient } from "@/lib/feedClient";
import { navigate } from "@/lib/nav";
import { useAuth } from "../AuthProvider";
import { Button } from "../ui/Button";
import { ListState } from "../ui/ListState";
import { EmptyState } from "../ui/primitives";
import { BackLink } from "../ui/BackLink";
import { PostCard } from "./PostCard";
import { useWeightUnit } from "./useWeightUnit";
import { ScreenHeader } from "../ui/ScreenHeader";

/** 댓글 알림이 붙이는 표식 — 읽으면 주소에서 지운다 */
function takeCommentsFlag(): boolean {
  if (typeof window === "undefined") return false;
  const u = new URL(window.location.href);
  if (u.searchParams.get("comments") !== "1") return false;
  u.searchParams.delete("comments");
  try {
    window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
  } catch {}
  return true;
}

function commentsFlagInUrl(): boolean {
  return typeof window !== "undefined" && new URL(window.location.href).searchParams.get("comments") === "1";
}

export default function CommentsClient({ postId }: { postId: string }) {
  const { user, loading: authLoading } = useAuth();
  const meId = user?.id ?? null;
  const unit = useWeightUnit();
  // null = 읽는 중 · "gone" = 지워졌거나 볼 수 없음(서버는 둘을 가리지 않는다) · "error" = 못 읽음
  const [post, setPost] = useState<Post | null | "gone" | "error">(null);
  const [openComments, setOpenComments] = useState(false);
  const seq = useRef(0);

  // 로그인한 뒤에만 표식을 읽는다 — 비로그인으로 먼저 지우면 로그인 뒤 시트가 안 열린다(REV 지적 4)
  useEffect(() => {
    if (meId && takeCommentsFlag()) setOpenComments(true);
  }, [meId]);

  const loadPost = useCallback(async () => {
    const my = ++seq.current;
    setPost(null); // 다른 글로 넘어오면 앞 글을 남기지 않는다
    try {
      const res = await feedClient().getPost({ postId });
      if (my === seq.current) setPost(res.post ?? "gone");
    } catch (e) {
      if (my === seq.current)
        setPost(e instanceof ConnectError && e.code === Code.NotFound ? "gone" : "error");
    }
  }, [postId]);

  useEffect(() => {
    // [원본] deps [user] — 캐시 값 → me() 결과로 객체가 두 번 바뀌어 두 번 불렀다(검토 지적)
    if (!meId) return; // 로그인 전에는 부르지 않는다 — 아래 로그인 안내
    void loadPost();
  }, [loadPost, meId]);

  const header = (
    <ScreenHeader
      title={t("post.viewTitle")}
      back={<BackLink fallbackHref="/feed" label={t("feed.title")} testId="comments-back" />}
    />
  );

  // 공유 링크를 비로그인으로 열면 — 실패 화면 대신 로그인 안내(로그인 뒤 이 글로 돌아온다)
  if (!user) {
    return (
      <div className="flex flex-1 flex-col">
        {header}
        {authLoading ? null : (
          <div className="flex flex-1 flex-col p-[var(--spacing-lg)]">
            <EmptyState
              icon="person-circle-outline"
              title={t("feed.loginRequiredTitle")}
              message={t("post.loginMessage")}
              action={
                <Button
                  title={t("profile.loginOrSignup")}
                  icon="person-circle-outline"
                  fullWidth={false}
                  // [원본] navigate("/account") — 로그인 뒤 글로 돌아오지 못했다
                  onPress={() =>
                    navigate(
                      `/account?next=${encodeURIComponent(`/feed/${postId}${commentsFlagInUrl() ? "?comments=1" : ""}`)}`,
                    )
                  }
                  testId="post-login"
                />
              }
            />
          </div>
        )}
      </div>
    );
  }

  // 지워졌거나 볼 수 없는 글
  if (post === "gone") {
    return (
      <div className="flex flex-1 flex-col">
        {header}
        <div className="flex flex-1 flex-col p-[var(--spacing-lg)]" data-testid="post-gone">
          <EmptyState
            icon="lock-closed-outline"
            title={t("post.goneTitle")}
            message={t("post.goneMessage")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {header}
      <div className="p-[var(--spacing-lg)]" data-testid="post-view">
        {post && post !== "error" ? (
          <PostCard
            post={post}
            meId={meId}
            unit={unit}
            initialCommentsOpen={openComments}
            onCommentsOpened={() => setOpenComments(false)} // 한 번만 — 다시 불러와도 닫은 시트가 또 뜨지 않게
            onChanged={(next) => setPost(next)}
            onDeleted={() => navigate("/feed", { replace: true })}
          />
        ) : (
          <ListState
            loading={post === null}
            error={post === "error"}
            onRetry={loadPost}
            skeletonVariant="post"
            emptyIcon="alert-circle-outline"
            emptyTitle="post.loadFailed"
          />
        )}
      </div>
    </div>
  );
}
