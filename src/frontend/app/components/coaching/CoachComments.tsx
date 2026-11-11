"use client";
// 코치 코멘트(SPEC-050 P4) — 청록 말풍선 · 코치 쪽 입력 · 회원 쪽 목록(/history/[id]).
//
// ── 어디에 두나 ─────────────────────────────────────────────────────────────
//   · 코치 — 회원 화면 기록 탭에서 운동을 펼치면 그 운동의 코멘트 + 입력칸(CoachCommentBox · 목록은 기록 탭이 한 번에 읽어 넘긴다)
//   · 회원 — 내 운동 상세(/history/[id]) 아래 「코치 코멘트」(MemberWorkoutComments · 그 운동만 서버에 묻는다)
//
// ── 메모리만 ────────────────────────────────────────────────────────────────
//   코멘트는 서버에만 있다 — 로컬 DB·localStorage 에 쓰지 않는다(회원 데이터는 코치 기기에 남기지 않는다 · REV-100).
//
// ── 깜빡임 없음 ─────────────────────────────────────────────────────────────
//   회원 쪽은 다 읽기 전·없을 때 아무것도 그리지 않는다(로드 전 [] ≠ 0개). 늦게 온 응답은 요청 세대가 다르면 버린다.
//   [개선] 오프라인이면 묻지 않는다(요청 0) · 한 번 읽은 운동은 메모리 캐시로 바로 그린다(다시 열 때 깜빡임 없음 ·
//   새로고침/세트 고침 reloadTick 이 오면 캐시를 버리고 다시 읽는다). 캐시는 모듈 메모리만 — 사용자별 열쇠.
import type { CoachComment } from "@app/contracts";
import { Code, ConnectError } from "@connectrpc/connect";
import { useEffect, useRef, useState } from "react";
import { errorText } from "@/lib/errorText";
import { lang, t } from "@/lib/i18n";
import { coachingClient } from "@/lib/coachingClient";
import { useAuth } from "../AuthProvider";
// import { useToast } from "../Toast"; // [원본] 숨김 알림 — SPEC-059
import { Button } from "../ui/Button";
// import { ConfirmDialog } from "../ui/Dialog"; // [원본] 숨기기 확인창 — SPEC-059
import { TextArea } from "../ui/inputs";
import { AppText, SectionHeader } from "../ui/primitives";

/** 코멘트 글자 상한(룬) — 서버와 같은 값(comments.go maxCommentRunes). */
export const COMMENT_MAX = 300;

const runeCount = (s: string) => [...s].length;

/** 코치 이름 — 코치가 탈퇴했으면(trainerId 빈 칸 · 0035) 「탈퇴한 코치」 */
const coachName = (c: CoachComment) =>
  c.trainerId ? c.trainerName || "?" : t("coaching.comment.formerCoach");

/** 남기기 오류 문구 — 하루 상한(ResourceExhausted)은 i18n 문구(서버 문구는 한국어뿐 · 리뷰 낮음) */
function sendErrorText(e: unknown): string {
  if (ConnectError.from(e).code === Code.ResourceExhausted) return t("coaching.comment.dailyLimit");
  return errorText(e);
}
const when = (ms: number) =>
  new Date(ms).toLocaleString(lang === "en" ? "en-US" : "ko-KR", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** 청록 말풍선 한 개 — 코치 이름·때·글. [원본] · 숨기기(할 수 있을 때만) — SPEC-059 로 뗐다. */
export function CommentBubble({
  c,
  // [원본] onHide, — SPEC-059 로 숨기기를 뗐다
  onHide: _onHide,
  showName = true,
}: {
  c: CoachComment;
  onHide?: () => void;
  showName?: boolean;
}) {
  return (
    <div
      data-testid="coach-comment"
      data-id={c.id}
      // [원본] className="mb-[var(--spacing-sm)] min-w-0 rounded-[var(--radius-md)] border border-(--color-coaching) border-l-4 bg-(--color-coaching-soft) px-[var(--spacing-md)] py-[var(--spacing-sm)]"
      // [개선] 둘레 상자는 걷고 청록 왼쪽 띠 + 옅은 청록 판만(코치 말이라는 뜻 · SPEC-056 F1 강조 띠)
      className="mb-[var(--spacing-sm)] min-w-0 border-(--color-coaching) border-l-4 bg-(--color-coaching-soft) px-[var(--spacing-md)] py-[var(--spacing-sm)]"
    >
      <div className="flex min-w-0 items-center gap-[var(--spacing-xs)]">
        <AppText
          variant="caption"
          className="min-w-0 flex-1 truncate font-semibold"
          style={{ color: "var(--color-coaching-ink)" }}
          data-testid="coach-comment-from"
        >
          {/* [원본] name: c.trainerName || "?" — 탈퇴한 코치는 「탈퇴한 코치」 */}
          {showName ? `${t("coaching.comment.from", { name: coachName(c) })} · ` : ""}
          {when(Number(c.createdAt))}
        </AppText>
        {/* [원본] 숨기기 버튼 — SPEC-059(#T19 · 1b)로 뗐다(서버도 거절 · onHide prop 은 모양만 남김)
        onHide && c.canHide ? (
          <button
            type="button"
            onClick={onHide}
            // 숨기기가 여러 개일 때 어느 코멘트인지(화면 읽기 · 리뷰 낮음)
            aria-label={t("coaching.comment.hideLabel", {
              name: coachName(c),
              when: when(Number(c.createdAt)),
            })}
            data-testid="coach-comment-hide"
            className="-my-[var(--spacing-xs)] -mr-[var(--spacing-xs)] inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center px-[var(--spacing-xs)] font-semibold text-(--color-coaching-ink) text-[length:var(--text-xs)]"
          >
            {t("coaching.comment.hide")}
          </button>
        ) : null
        */}
      </div>
      <AppText
        variant="body"
        className="block whitespace-pre-wrap break-words"
        data-testid="coach-comment-body"
      >
        {c.body}
      </AppText>
    </div>
  );
}

/**
 * 코치 쪽 — 펼친 운동 하나의 코멘트 + 입력칸. 목록은 부모(기록 탭)가 갖고 있고, 남기기가 끝나면 onAdded 로 알린다([원본] 숨기기 → onHidden — SPEC-059 로 뗐다 · prop 모양은 그대로).
 * PermissionDenied(해지·범위 끔)는 onDenied — 회원 화면이 연결을 다시 읽어 끝남/꺼짐을 가른다.
 */
export function CoachCommentBox({
  memberId,
  workoutId,
  comments,
  onAdded,
  // [원본] onHidden, — 숨기기를 뗐다(SPEC-059 · 부르는 쪽 모양은 그대로)
  onHidden: _onHidden,
  onDenied,
}: {
  memberId: string;
  workoutId: string;
  comments: readonly CoachComment[];
  onAdded: (c: CoachComment) => void;
  onHidden: (id: string) => void;
  onDenied: (e: unknown) => boolean;
}) {
  // [원본] const toast = useToast(); — 숨김 알림만 썼다(SPEC-059)
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // [원본] const [hiding, setHiding] = useState<CoachComment | null>(null); — 숨기기를 뗐다(SPEC-059)
  // 연타 가드 — busy 상태는 다음 그림에서야 바뀌어 같은 틱의 두 번째 누름을 못 막는다(리뷰 낮음)
  const sendingRef = useRef(false);
  const n = runeCount(text.trim());
  const over = n > COMMENT_MAX;

  async function send() {
    if (sendingRef.current || busy || n === 0 || over) return;
    sendingRef.current = true;
    const sent = text;
    setBusy(true);
    setError(null);
    try {
      const r = await coachingClient().addCoachComment({ memberId, workoutId, body: sent.trim() });
      if (r.comment) onAdded(r.comment);
      // [원본] setText("") — 보내는 사이 더 친 글자까지 지웠다 · [개선] 보낸 글자 그대로일 때만 비운다
      setText((cur) => (cur === sent ? "" : cur));
    } catch (e) {
      // [원본] setError(errorText(e))
      if (!onDenied(e)) setError(sendErrorText(e));
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  }

  // [원본] 숨기기 — SPEC-059(#T19 · 1b)로 뗐다. 서버도 거절한다.
  // async function hide(c: CoachComment) {
  //   setHiding(null);
  //   try {
  //     await coachingClient().hideCoachComment({ id: c.id });
  //     onHidden(c.id);
  //     toast(t("coaching.comment.hidden"));
  //   } catch (e) {
  //     if (!onDenied(e)) toast(errorText(e), "error");
  //   }
  // }

  return (
    <div data-testid="coach-comments" className="mt-[var(--spacing-sm)]">
      <AppText variant="label" color="textMuted" className="mb-[var(--spacing-xs)] block font-semibold">
        {t("coaching.comment.title")}
      </AppText>
      {comments.map((c) => (
        // [원본] <CommentBubble key={c.id} c={c} showName={false} onHide={() => setHiding(c)} /> — 숨기기를 뗐다(SPEC-059)
        <CommentBubble key={c.id} c={c} showName={false} />
      ))}
      <TextArea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        placeholder={t("coaching.comment.placeholder")}
        aria-label={t("coaching.comment.placeholder")}
        rows={2}
        testId="coach-comment-input"
        className="mb-[var(--spacing-xs)]!"
      />
      <div className="flex min-w-0 items-center gap-[var(--spacing-sm)]">
        <AppText
          variant="caption"
          color={over ? "danger" : "textMuted"}
          className="min-w-0 flex-1"
          aria-live="polite"
          data-testid="coach-comment-length"
        >
          {t("coaching.comment.length", { count: n, max: COMMENT_MAX })}
        </AppText>
        <Button
          title={t("coaching.comment.send")}
          variant="tonal"
          fullWidth={false}
          loading={busy}
          disabled={n === 0 || over}
          onPress={() => void send()}
          testId="coach-comment-send"
          className="min-h-11 shrink-0"
        />
      </div>
      {error ? (
        <AppText
          variant="caption"
          color="danger"
          className="mt-[var(--spacing-xs)] block break-words"
          data-testid="coach-comment-error"
        >
          {error}
        </AppText>
      ) : null}
      {/* [원본] 숨기기 확인창 — SPEC-059 로 뗐다
      hiding ? (
        <ConfirmDialog
          title={t("coaching.comment.hideTitle")}
          message={t("coaching.comment.hideMessage")}
          confirmLabel={t("coaching.comment.hide")}
          destructive
          onConfirm={() => void hide(hiding)}
          onCancel={() => setHiding(null)}
          testId="coach-comment-hide-confirm"
        />
      ) : null
      */}
    </div>
  );
}

/** 회원 쪽 코멘트 캐시(사용자:운동 id → 목록 · 모듈 메모리만 · 50개 넘으면 오래된 것부터 버린다).
 *  60초 안이면 묻지 않는다 · 그 뒤나 코멘트 알림으로 왔으면(?comments=1) 캐시를 먼저 그리고 뒤에서 다시 묻는다. */
const CACHE_TTL_MS = 60_000;
const memberCommentCache = new Map<string, { at: number; rows: CoachComment[] }>();
function cachePut(k: string, v: CoachComment[]) {
  if (!k) return;
  memberCommentCache.delete(k);
  memberCommentCache.set(k, { at: Date.now(), rows: v });
  if (memberCommentCache.size > 50) {
    const first = memberCommentCache.keys().next().value;
    if (first !== undefined) memberCommentCache.delete(first);
  }
}

/**
 * 회원 쪽 — 내 운동 상세 아래 「코치 코멘트」. 로그인하지 않았거나·읽는 중·없으면 아무것도 그리지 않는다.
 * 읽기 실패도 조용히 둔다(운동 상세가 주인공 — 다음에 열 때 다시 읽는다).
 */
export function MemberWorkoutComments({
  workoutId,
  reloadTick = 0,
}: {
  workoutId: string;
  reloadTick?: number;
}) {
  const { user, loading } = useAuth();
  const userId = user?.id;
  // [원본] const toast = useToast(); — 숨김 알림만 썼다(SPEC-059)
  const cacheKey = userId && workoutId ? `${userId}:${workoutId}` : "";
  // [원본] useState<CoachComment[] | null>(null) — [개선] 읽은 적 있으면 캐시로 바로(다시 열 때 깜빡임 없음)
  const [rows, setRows] = useState<CoachComment[] | null>(
    () => memberCommentCache.get(cacheKey)?.rows ?? null,
  );
  // [원본] const [hiding, setHiding] = useState<CoachComment | null>(null); — 숨기기를 뗐다(SPEC-059)
  const genRef = useRef(0);
  const tickRef = useRef(reloadTick);

  useEffect(() => {
    const gen = ++genRef.current;
    // reloadTick 이 바뀌었으면(세트 고침·다시 읽기) 캐시를 버리고 다시 묻는다
    if (tickRef.current !== reloadTick) {
      tickRef.current = reloadTick;
      if (cacheKey) memberCommentCache.delete(cacheKey);
    }
    const cached = cacheKey ? memberCommentCache.get(cacheKey) : undefined;
    setRows(cached?.rows ?? null);
    if (loading || !userId || !workoutId) return;
    let fromNotif = false;
    try {
      fromNotif = new URLSearchParams(window.location.search).get("comments") === "1";
    } catch {
      // 주소를 못 읽으면 캐시 기준대로
    }
    if (cached && !fromNotif && Date.now() - cached.at < CACHE_TTL_MS) return;
    // 오프라인이면 묻지 않는다 — 요청 0 · 아무것도 그리지 않는다(다음에 열 때 다시)
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    coachingClient()
      .listCoachComments({ workoutId })
      .then((r) => {
        if (gen !== genRef.current) return;
        cachePut(cacheKey, r.comments);
        setRows(r.comments);
      })
      .catch(() => {
        // 실패는 캐시하지 않는다(다음에 열 때 다시 묻는다) · 캐시가 있으면 그대로 둔다
        if (gen === genRef.current) setRows((prev) => prev ?? []);
      });
    return () => {
      if (genRef.current === gen) genRef.current++;
    };
  }, [loading, userId, workoutId, cacheKey, reloadTick]);

  // [원본] 숨기기 — SPEC-059(#T19 · 1b)로 뗐다. 서버도 거절한다.
  // async function hide(c: CoachComment) {
  //   setHiding(null);
  //   try {
  //     await coachingClient().hideCoachComment({ id: c.id });
  //     setRows((prev) => {
  //       const next = (prev ?? []).filter((x) => x.id !== c.id);
  //       cachePut(cacheKey, next);
  //       return next;
  //     });
  //     toast(t("coaching.comment.hidden"));
  //   } catch (e) {
  //     toast(errorText(e), "error");
  //   }
  // }

  // 코멘트 알림으로 왔으면(?comments=1) 다 읽은 뒤 이 자리로
  const ref = useRef<HTMLElement>(null);
  const has = !!rows && rows.length > 0;
  useEffect(() => {
    if (!has) return;
    try {
      if (new URLSearchParams(window.location.search).get("comments") === "1")
        ref.current?.scrollIntoView({ block: "center" });
    } catch {
      // 주소를 못 읽어도 목록은 그대로
    }
  }, [has]);

  if (!rows || rows.length === 0) return null;
  return (
    <section
      ref={ref}
      data-testid="member-coach-comments"
      className="mt-[var(--spacing-lg)] mb-[var(--spacing-lg)]"
    >
      <SectionHeader title={t("coaching.comment.title")} />
      {rows.map((c) => (
        // [원본] <CommentBubble key={c.id} c={c} onHide={() => setHiding(c)} /> — 숨기기를 뗐다(SPEC-059)
        <CommentBubble key={c.id} c={c} />
      ))}
      {/* [원본] 숨기기 확인창 — SPEC-059 로 뗐다
      hiding ? (
        <ConfirmDialog
          title={t("coaching.comment.hideTitle")}
          message={t("coaching.comment.hideMessageMember")}
          confirmLabel={t("coaching.comment.hide")}
          destructive
          onConfirm={() => void hide(hiding)}
          onCancel={() => setHiding(null)}
          testId="coach-comment-hide-confirm"
        />
      ) : null
      */}
    </section>
  );
}
