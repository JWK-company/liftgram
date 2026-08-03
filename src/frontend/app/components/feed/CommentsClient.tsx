"use client";
// @plm SRS-007  댓글 — app의 features/social/CommentsScreen.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
//   목록   루트 댓글 · (있으면) "답글 N개 보기" → 펼치면 들여쓴 답글
//   작성   답글 대상 칩 + 입력 + 게시
//
// ── 답글을 미리 안 가져오는 이유 ────────────────────────────────────────────
// 댓글 20개마다 답글까지 실으면 대부분 안 펼치는 것을 매번 나른다. **펼칠 때** 가져온다.
//
// ── 낙관적 삭제 ─────────────────────────────────────────────────────────────
// 지우면 목록에서 즉시 뺀다. 실패하면 다시 불러 되돌린다 —
// 지운 줄 알았는데 남아 있는 것보다, 잠깐 사라졌다 돌아오는 편이 덜 위험하다.
// ─────────────────────────────────────────────────────────────────────────────
import { TargetType, type Comment } from "@app/contracts";
import { useCallback, useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { feedClient, feedErrorMessage } from "@/lib/feedClient";
import { useAuth } from "../AuthProvider";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { TextArea } from "../ui/inputs";
import { ListState } from "../ui/ListState";
import { AppText } from "../ui/primitives";
import { ScreenHeader } from "../ui/ScreenHeader";
import { ReportSheet } from "../moderation/ReportSheet";

export default function CommentsClient({ postId }: { postId: string }) {
  const { user } = useAuth();
  const meId = user?.id ?? null;

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

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await feedClient().listComments({ postId });
      setComments(res.comments);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

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
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("comments.title")}
        back={
          <a href="/feed" aria-label={t("feed.title")} data-testid="comments-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
      />

      <div className="flex-1 p-[var(--spacing-lg)]" data-testid="comments-list">
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
                onReply={() =>
                  setReplyingTo({ id: c.id, name: c.author?.displayName || t("discover.unnamed") })
                }
                onDelete={() => remove(c)}
                onReport={() => setReporting(c.id)}
              />
              {c.replyCount > 0 || (replies[c.id]?.length ?? 0) > 0 ? (
                <button
                  type="button"
                  onClick={() => toggleReplies(c.id)}
                  data-testid="comment-replies-toggle"
                  className="mb-[var(--spacing-md)] ml-[44px] flex items-center gap-[4px]"
                >
                  <Icon
                    name={expanded.has(c.id) ? "chevron-up" : "chevron-down"}
                    size={14}
                    color="var(--color-brand)"
                  />
                  <AppText variant="label" color="primary">
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
                        onReply={() =>
                          setReplyingTo({ id: c.id, name: r.author?.displayName || t("discover.unnamed") })
                        }
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
        <div className="px-[var(--spacing-lg)] pb-[var(--spacing-xs)]">
          <AppText variant="caption" color="danger" data-testid="comments-error">
            {error}
          </AppText>
        </div>
      ) : null}

      {replyingTo ? (
        <div className="flex items-center justify-between bg-(--color-surface-alt) px-[var(--spacing-lg)] py-[var(--spacing-xs)]">
          <AppText variant="caption" color="textMuted">
            {t("comments.replyingTo", { name: replyingTo.name })}
          </AppText>
          <button type="button" onClick={() => setReplyingTo(null)} aria-label={t("common.cancel")}>
            <Icon name="close" size={16} color="var(--color-ink2)" />
          </button>
        </div>
      ) : null}

      {reporting ? (
        <ReportSheet
          targetType={TargetType.COMMENT}
          targetId={reporting}
          onClose={() => setReporting(null)}
        />
      ) : null}

      <div className="sticky bottom-0 flex items-end gap-[var(--spacing-sm)] border-(--color-line) border-t bg-(--color-surface) p-[var(--spacing-md)]">
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
    </div>
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
        <div className="mt-[var(--spacing-xs)] flex items-center gap-[var(--spacing-lg)]">
          <button
            type="button"
            onClick={onLike}
            aria-pressed={comment.likedByMe}
            data-testid="comment-like"
            className="flex items-center gap-[3px]"
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
          <button type="button" onClick={onReply} data-testid="comment-reply">
            <AppText variant="label" color="textMuted">
              {t("comments.reply")}
            </AppText>
          </button>
        </div>
      </div>
      {mine ? (
        <button type="button" onClick={onDelete} aria-label={t("common.delete")} data-testid="comment-delete">
          <Icon name="trash-outline" size={18} color="var(--color-ink3)" />
        </button>
      ) : (
        <button type="button" onClick={onReport} aria-label={t("report.title")} data-testid="comment-report">
          <Icon name="flag-outline" size={16} color="var(--color-ink3)" />
        </button>
      )}
    </div>
  );
}
