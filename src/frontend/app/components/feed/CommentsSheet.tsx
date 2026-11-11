"use client";
// 댓글 시트(2026-11-09) — 글 카드의 💬 를 누르면 아래에서 올라온다(인스타·유튜브식).
//
// ─────────────────────────────────────────────────────────────────────────────
//   본문 없음   댓글은 글에 다는 것이라 시트에 글을 다시 싣지 않는다 — 밑에 깔린 카드가 그 글이다
//   목록       루트 댓글 · (있으면) "답글 N개 보기" → 펼치면 들여쓴 답글
//   작성       시트 바닥에 붙은 입력칸 · 답글 대상 칩
//
// 예전에는 /feed/<id> 전체 화면이 댓글 화면이었다(CommentsClient — 지금은 글 보기 화면).
// 목록·답글·좋아요·삭제 로직은 그 화면에서 그대로 옮겼다.
//
// ── 답글을 미리 안 가져오는 이유 ────────────────────────────────────────────
// 댓글 20개마다 답글까지 실으면 대부분 안 펼치는 것을 매번 나른다. **펼칠 때** 가져온다.
//
// ── 낙관적 삭제 ─────────────────────────────────────────────────────────────
// 지우면 목록에서 즉시 뺀다. 실패하면 다시 불러 되돌린다 —
// 지운 줄 알았는데 남아 있는 것보다, 잠깐 사라졌다 돌아오는 편이 덜 위험하다.
//
// ── 늦은 응답 ───────────────────────────────────────────────────────────────
// 다시 불러오기가 겹치면 마지막 요청의 응답만 쓴다(먼저 보낸 응답이 방금 단 댓글을 덮지 않게).
// ─────────────────────────────────────────────────────────────────────────────
import { TargetType, routes, type Comment } from "@app/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { feedClient, feedErrorMessage } from "@/lib/feedClient";
import { navigate } from "@/lib/nav";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Overlay } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { TextArea } from "../ui/inputs";
import { ListState } from "../ui/ListState";
import { AppText, EmptyState } from "../ui/primitives";
import { ReportSheet } from "../moderation/ReportSheet";

export function CommentsSheet({
  postId,
  meId,
  onClose,
  onCountChange,
}: {
  postId: string;
  meId: string | null;
  onClose: () => void;
  /** 루트 댓글을 달거나 지웠을 때 — 카드의 댓글 수를 맞춘다(+1 / -1) */
  onCountChange?: (delta: number) => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [replies, setReplies] = useState<Record<string, Comment[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [text, setText] = useState("");
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const seq = useRef(0);
  const inputWrap = useRef<HTMLDivElement>(null);
  const kb = useKeyboardInset();

  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    setLoadError(false);
    try {
      const res = await feedClient().listComments({ postId });
      if (my === seq.current) setComments(res.comments);
    } catch {
      if (my === seq.current) setLoadError(true);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (!meId) return; // 로그인 전에는 부르지 않는다 — 아래 로그인 안내
    void load();
    return () => {
      seq.current += 1; // 닫히거나 사람이 바뀌면 진행 중 응답을 버린다
    };
  }, [load, meId]);

  async function toggleReplies(rootId: string) {
    const next = new Set(expanded);
    if (next.has(rootId)) {
      next.delete(rootId);
      setExpanded(next);
      return;
    }
    next.add(rootId);
    setExpanded(next);
    if (replies[rootId]) return; // 이미 가져왔다
    try {
      const res = await feedClient().listReplies({ commentId: rootId });
      setReplies((prev) => ({ ...prev, [rootId]: res.comments }));
    } catch {
      setReplies((prev) => ({ ...prev, [rootId]: [] }));
    }
  }

  function startReply(id: string, name: string) {
    setReplyingTo({ id, name });
    inputWrap.current?.querySelector("textarea")?.focus();
  }

  async function add() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await feedClient().createComment({
        postId,
        body,
        parentId: replyingTo?.id ?? "",
      });
      const c = res.comment;
      if (!c) return;
      if (c.parentId) {
        // 펼쳐 놓은 자리에 바로 붙이고, 루트의 "답글 N개"도 올린다.
        setReplies((prev) => ({ ...prev, [c.parentId]: [...(prev[c.parentId] ?? []), c] }));
        setExpanded((prev) => new Set(prev).add(c.parentId));
        setComments((prev) =>
          prev.map((x) => (x.id === c.parentId ? ({ ...x, replyCount: x.replyCount + 1 } as Comment) : x)),
        );
      } else {
        setComments((prev) => [...prev, c]);
      }
      // [원본] 루트 댓글만 +1 — 서버 comment_count 는 답글까지 센다(REV 지적 1)
      onCountChange?.(1);
      setText("");
      setReplyingTo(null);
    } catch (e) {
      setError(feedErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Comment) {
    const rootId = c.parentId;
    // 서버는 루트를 지우면 딸린 답글까지 함께 뺀다 — 지우기 전 최신 답글 수로 센다
    const gone = rootId ? 1 : 1 + (comments.find((x) => x.id === c.id)?.replyCount ?? c.replyCount);
    if (rootId) {
      setReplies((prev) => ({ ...prev, [rootId]: (prev[rootId] ?? []).filter((x) => x.id !== c.id) }));
      setComments((prev) =>
        prev.map((x) =>
          x.id === rootId ? ({ ...x, replyCount: Math.max(0, x.replyCount - 1) } as Comment) : x,
        ),
      );
    } else {
      setComments((prev) => prev.filter((x) => x.id !== c.id));
      setReplies((prev) => {
        const next = { ...prev };
        delete next[c.id];
        return next;
      });
    }
    try {
      await feedClient().deleteComment({ commentId: c.id });
      // [원본] if (!rootId) onCountChange?.(-1);
      onCountChange?.(-gone);
    } catch {
      setError(t("comments.failed"));
      void load();
    }
  }

  async function toggleLike(c: Comment, inReplyTo?: string) {
    const liked = c.likedByMe;
    const patch = (x: Comment) =>
      x.id === c.id ? ({ ...x, likedByMe: !liked, likeCount: x.likeCount + (liked ? -1 : 1) } as Comment) : x;
    if (inReplyTo) setReplies((prev) => ({ ...prev, [inReplyTo]: (prev[inReplyTo] ?? []).map(patch) }));
    else setComments((prev) => prev.map(patch));

    try {
      const res = liked
        ? await feedClient().unlikeComment({ commentId: c.id })
        : await feedClient().likeComment({ commentId: c.id });
      const settle = (x: Comment) =>
        x.id === c.id ? ({ ...x, likedByMe: res.likedByMe, likeCount: res.likeCount } as Comment) : x;
      if (inReplyTo) setReplies((prev) => ({ ...prev, [inReplyTo]: (prev[inReplyTo] ?? []).map(settle) }));
      else setComments((prev) => prev.map(settle));
    } catch {
      const undo = (x: Comment) =>
        x.id === c.id ? ({ ...x, likedByMe: liked, likeCount: c.likeCount } as Comment) : x;
      if (inReplyTo) setReplies((prev) => ({ ...prev, [inReplyTo]: (prev[inReplyTo] ?? []).map(undo) }));
      else setComments((prev) => prev.map(undo));
    }
  }

  return (
    <Overlay onClose={onClose} placement="bottom" testId="comments-sheet">
      {/* 높이를 정해 두고 목록만 스크롤한다 — 입력칸은 늘 시트 바닥에 */}
      {/* iOS 웹뷰는 키보드가 떠도 dvh 가 줄지 않는다 — 보이는 높이(visualViewport)로 상한을 다시 잡고 키보드만큼 띄운다 */}
      <div
        className="flex h-[min(72dvh,680px)] flex-col"
        style={
          kb ? { height: `min(${Math.round(kb.visible * 0.8)}px, 680px)`, marginBottom: kb.inset } : undefined
        }
      >
        <div className="flex items-center justify-between pb-[var(--spacing-sm)]">
          <AppText variant="heading">{t("comments.title")}</AppText>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            data-testid="comments-sheet-close"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center"
          >
            <Icon name="close" size={22} color="var(--color-ink2)" />
          </button>
        </div>

        {!meId ? (
          <div className="flex flex-1 flex-col justify-center">
            <EmptyState
              icon="person-circle-outline"
              title={t("feed.loginRequiredTitle")}
              message={t("comments.loginMessage")}
              action={
                <Button
                  title={t("profile.loginOrSignup")}
                  icon="person-circle-outline"
                  fullWidth={false}
                  onPress={() => {
                    onClose();
                    navigate(`/account?next=${encodeURIComponent(routes.postComments(postId))}`);
                  }}
                  testId="comments-login"
                />
              }
            />
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="comments-list">
              {comments.length === 0 ? (
                <ListState
                  loading={loading}
                  error={loadError}
                  onRetry={load}
                  skeletonVariant="comment"
                  emptyIcon="chatbubble-outline"
                  emptyTitle="comments.empty"
                  emptyMessage="comments.emptyMessage"
                />
              ) : (
                comments.map((c) => (
                  <div key={c.id}>
                    <CommentRow
                      comment={c}
                      mine={c.author?.id === meId}
                      onLike={() => toggleLike(c)}
                      onReply={() => startReply(c.id, c.author?.displayName || t("discover.unnamed"))}
                      onDelete={() => remove(c)}
                      onReport={() => setReporting(c.id)}
                    />
                    {c.replyCount > 0 || (replies[c.id]?.length ?? 0) > 0 ? (
                      <button
                        type="button"
                        onClick={() => toggleReplies(c.id)}
                        data-testid="comment-replies-toggle"
                        className="mb-[var(--spacing-xs)] ml-[44px] flex min-h-[44px] items-center gap-[4px]"
                      >
                        <Icon
                          name={expanded.has(c.id) ? "chevron-up" : "chevron-down"}
                          size={14}
                          // [원본] color="var(--color-brand)" · AppText color="primary" — 그 자리 펼침은 ▾/▴ + 진한 굵은 글자(SPEC-057 R5·R6 · REV-132)
                          color="var(--color-ink2)"
                        />
                        <AppText variant="label" color="text" className="font-semibold!">
                          {expanded.has(c.id)
                            ? t("comments.hideReplies")
                            : t("comments.viewReplies", { count: c.replyCount })}
                        </AppText>
                      </button>
                    ) : null}
                    {expanded.has(c.id)
                      ? (replies[c.id] ?? []).map((r) => (
                          <div key={r.id} className="ml-[var(--spacing-xl)]">
                            <CommentRow
                              comment={r}
                              mine={r.author?.id === meId}
                              onLike={() => toggleLike(r, c.id)}
                              onReply={() => startReply(c.id, r.author?.displayName || t("discover.unnamed"))}
                              onDelete={() => remove(r)}
                              onReport={() => setReporting(r.id)}
                            />
                          </div>
                        ))
                      : null}
                  </div>
                ))
              )}
            </div>

            {error ? (
              <div className="pt-[var(--spacing-xs)]">
                <AppText variant="caption" color="danger" data-testid="comments-error">
                  {error}
                </AppText>
              </div>
            ) : null}

            {replyingTo ? (
              <div className="-mx-[var(--spacing-lg)] flex items-center justify-between bg-(--color-surface-alt) px-[var(--spacing-lg)] py-[var(--spacing-xs)]">
                <AppText variant="caption" color="textMuted">
                  {t("comments.replyingTo", { name: replyingTo.name })}
                </AppText>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  aria-label={t("common.cancel")}
                  className="-my-[var(--spacing-sm)] flex min-h-[44px] min-w-[44px] items-center justify-center"
                >
                  <Icon name="close" size={16} color="var(--color-ink2)" />
                </button>
              </div>
            ) : null}

            <div
              ref={inputWrap}
              className="-mx-[var(--spacing-lg)] flex items-end gap-[var(--spacing-sm)] border-(--color-line) border-t px-[var(--spacing-lg)] pt-[var(--spacing-md)]"
            >
              <div className="flex-1">
                <TextArea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t("comments.placeholder")}
                  rows={1}
                  testId="comment-input"
                  className="mb-0!"
                />
              </div>
              <Button
                title={t("comments.post")}
                icon="send"
                size="sm"
                fullWidth={false}
                loading={busy}
                disabled={!text.trim()}
                onPress={add}
                testId="comment-post"
              />
            </div>
          </>
        )}
      </div>

      {reporting ? (
        <ReportSheet
          targetType={TargetType.COMMENT}
          targetId={reporting}
          onClose={() => setReporting(null)}
        />
      ) : null}
    </Overlay>
  );
}

function CommentRow({
  comment,
  mine,
  onLike,
  onReply,
  onDelete,
  onReport,
}: {
  comment: Comment;
  mine: boolean;
  onLike: () => void;
  onReply: () => void;
  onDelete: () => void;
  onReport: () => void;
}) {
  const name = comment.author?.displayName || t("discover.unnamed");
  return (
    <div
      className="mb-[var(--spacing-md)] flex items-start gap-[var(--spacing-sm)]"
      data-testid="comment-row"
    >
      <Avatar name={name} url={comment.author?.avatarUrl} size={32} />
      <div className="min-w-0 flex-1">
        <AppText variant="caption" className="block font-medium!">
          {name}
        </AppText>
        <AppText variant="body" className="mt-[2px] block whitespace-pre-wrap break-words">
          {comment.body}
        </AppText>
        <div className="-mb-[10px] flex items-center gap-[var(--spacing-sm)]">
          <button
            type="button"
            onClick={onLike}
            aria-pressed={comment.likedByMe}
            data-testid="comment-like"
            className="-ml-[12px] flex min-h-[44px] min-w-[44px] items-center justify-center gap-[3px]"
          >
            <Icon
              name={comment.likedByMe ? "heart" : "heart-outline"}
              size={15}
              color={comment.likedByMe ? "var(--color-bad)" : "var(--color-ink2)"}
            />
            {comment.likeCount > 0 ? (
              <AppText variant="label" color="textMuted">
                {String(comment.likeCount)}
              </AppText>
            ) : null}
          </button>
          <button
            type="button"
            onClick={onReply}
            data-testid="comment-reply"
            className="flex min-h-[44px] items-center px-[var(--spacing-xs)]"
          >
            <AppText variant="label" color="textMuted">
              {t("comments.reply")}
            </AppText>
          </button>
        </div>
      </div>
      {mine ? (
        <button
          type="button"
          onClick={onDelete}
          aria-label={t("common.delete")}
          data-testid="comment-delete"
          className="-mt-[10px] -mr-[12px] flex min-h-[44px] min-w-[44px] items-center justify-center"
        >
          <Icon name="trash-outline" size={18} color="var(--color-ink3)" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onReport}
          aria-label={t("report.title")}
          data-testid="comment-report"
          className="-mt-[10px] -mr-[12px] flex min-h-[44px] min-w-[44px] items-center justify-center"
        >
          <Icon name="flag-outline" size={16} color="var(--color-ink3)" />
        </button>
      )}
    </div>
  );
}

/** 키보드가 가린 높이 — iOS 웹뷰처럼 키보드가 떠도 레이아웃 높이가 그대로인 곳에서만 값이 생긴다(안드로이드·데스크톱은 null) */
function useKeyboardInset(): { inset: number; visible: number } | null {
  const [v, setV] = useState<{ inset: number; visible: number } | null>(null);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const on = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setV(inset > 80 ? { inset, visible: vv.height } : null); // 주소창 접힘 같은 작은 변화는 무시
    };
    on();
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    return () => {
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
    };
  }, []);
  return v;
}
