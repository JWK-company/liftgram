"use client";
// @plm SRS-020  알림 — app의 features/social/NotificationsScreen.tsx를 웹으로
//
// 서버는 **문구를 만들지 않는다.** 종류(follow|like|comment)와 누가·어느 글만 오고,
// 문장은 여기서 만든다 — 보는 사람의 언어로 써야 하기 때문이다.
//
// 화면을 열면 **한 번에 읽음 처리**한다(개별 읽음은 app에도 없다). 그래야 피드 머리의
// 배지가 곧바로 사라진다.
import type { Notification } from "@app/contracts";
import { NotificationKind, routes } from "@app/contracts";
import { useCallback, useEffect, useState } from "react";
import { lang, t } from "@/lib/i18n";
import { dmClient, notificationClient } from "@/lib/dmClient";
import { navigate } from "@/lib/nav";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import { ListState } from "../ui/ListState";
import { AppText } from "../ui/primitives";
import { ScreenHeader } from "../ui/ScreenHeader";

function sentence(n: Notification): string {
  const name = n.actor?.displayName || t("discover.unnamed");
  switch (n.kind) {
    case NotificationKind.FOLLOW:
      return t("notif.follow", { name });
    case NotificationKind.LIKE:
      return t("notif.like", { name });
    case NotificationKind.COMMENT:
      return t("notif.comment", { name });
    case NotificationKind.COACHING_SUMMARY: // 숫자 없음(S-7) @plm SRS-080
      return t("notif.coaching_summary", { name });
    // 코칭 v2(SPEC-050) — 받는 쪽은 반대편 · 대상은 ref_id(post_id 는 비어 있다)
    case NotificationKind.COACHING_REQUEST:
      return t("notif.coaching_request", { name });
    case NotificationKind.COACHING_ACCEPT:
      return t("notif.coaching_accept", { name });
    case NotificationKind.COACHING_REVOKE:
      return t("notif.coaching_revoke", { name });
    case NotificationKind.COACHING_ROUTINE:
      return t("notif.coaching_routine", { name });
    case NotificationKind.COACHING_ROUTINE_UPDATE:
      return t("notif.coaching_routine_update", { name });
    case NotificationKind.COACHING_COMMENT:
      return t("notif.coaching_comment", { name });
    default:
      return t("notif.generic", { name });
  }
}

/** 눌렀을 때 갈 곳 — 팔로우는 그 사람, 좋아요·댓글은 그 글. */
function target(n: Notification): string {
  if (n.kind === NotificationKind.FOLLOW) return routes.userProfile(n.actor?.id ?? "");
  if (n.kind === NotificationKind.COACHING_SUMMARY) return "/messages"; // 실제 이동은 openSummary(그 회원과의 대화) @plm SRS-080
  // 코칭 v2(SPEC-050) — post_id 가 비어 있어 아래 글 화면 길로 떨어지지 않게 먼저 고른다
  //   요청·수락·해지 → /coaching · 루틴 → 운동 홈(받은 루틴) · 코멘트 → 지금은 /coaching(P4 에서 ref_id = 운동 id → /history/[ref_id])
  const coaching = coachingTarget(n);
  if (coaching) return coaching;
  // [원본] return n.postId ? routes.postComments(n.postId) : "/feed";
  // [개선 2026-11-09] 댓글 알림은 글 보기 + 댓글 시트를 바로 연다(?comments=1) · 좋아요는 글만
  if (!n.postId) return "/feed";
  return n.kind === NotificationKind.COMMENT
    ? `${routes.postComments(n.postId)}?comments=1`
    : routes.postComments(n.postId);
}

/** 코칭 알림의 갈 곳 — 코칭 종류가 아니면 null. */
export function coachingTarget(n: Pick<Notification, "kind" | "refId">): string | null {
  switch (n.kind) {
    case NotificationKind.COACHING_REQUEST:
    case NotificationKind.COACHING_ACCEPT:
    case NotificationKind.COACHING_REVOKE:
      return "/coaching";
    case NotificationKind.COACHING_ROUTINE:
    case NotificationKind.COACHING_ROUTINE_UPDATE:
      return "/";
    case NotificationKind.COACHING_COMMENT:
      return "/coaching";
    default:
      return null;
  }
}

/** 성과 요약 알림 — 보낸 회원(actor)과의 1:1 대화로 가서 그 카드를 강조한다(postId 는 비어 있다 · S-16·U-17). @plm SRS-080 */
async function openSummary(n: Notification): Promise<void> {
  const memberId = n.actor?.id;
  if (!memberId) return navigate("/messages");
  try {
    const res = await dmClient().getOrCreateDirect({ userId: memberId });
    const id = res.conversation?.id;
    navigate(id ? `${routes.conversation(id)}?highlight=summary` : "/messages");
  } catch {
    navigate("/messages");
  }
}

/** 알림이 온 때 — 방금 · N분 전 · N시간 전 · 어제 · N일 전(일주일 안) · 그 뒤는 날짜(S-25 · 2026-11-09) */
export function notifWhen(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return t("notif.justNow");
  if (min < 60) return t("notif.minutesAgo", { n: min });
  const d = new Date(ms);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000); // round — 서머타임 23·25시간 날(리뷰 L-4)
  if (days <= 0) return t("notif.hoursAgo", { n: Math.max(1, Math.floor(min / 60)) });
  if (days === 1) return t("notif.yesterday");
  if (days < 7) return t("notif.daysAgo", { n: days });
  const loc = lang === "ko" ? "ko-KR" : "en-US";
  return d.getFullYear() === today.getFullYear()
    ? d.toLocaleDateString(loc, { month: "long", day: "numeric" })
    : d.toLocaleDateString(loc, { year: "numeric", month: "long", day: "numeric" });
}

export default function NotificationsClient() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationClient().listNotifications({});
      setItems(res.notifications);
      setError(false);
      // 열었으니 읽은 것으로 친다 — 배지가 곧바로 사라진다.
      await notificationClient().markAllRead({});
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("notif.title")}
        back={
          <a href="/feed" aria-label={t("feed.title")} data-testid="notif-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
      />
      <div className="flex-1 p-[var(--spacing-lg)] pt-[var(--spacing-md)]" data-testid="notif-list">
        {items.length === 0 ? (
          <ListState
            loading={loading}
            error={error}
            onRetry={load}
            skeletonVariant="row"
            emptyIcon="notifications-outline"
            emptyTitle="notif.empty"
            emptyMessage="notif.emptyMessage"
          />
        ) : (
          // [원본] 한 목록에 안 읽은 줄만 옅은 브랜드 바탕 + 점 — 날짜가 없고, 읽은 줄과 차이가 약했다(S-25 · 피드백 2026-11-09).
          //   옮기기 전 판은 git a5084b3 의 이 파일
          // [개선] 「새 알림」(안 읽음 — 굵은 글 · 점 · 옅은 빨강 바탕)과 「이전 알림」(읽음 — 흐린 글)으로 나누고 줄마다 온 때
          <div className="flex flex-col gap-[var(--spacing-lg)]">
            {(
              [
                ["new", items.filter((n) => !n.read)],
                ["earlier", items.filter((n) => n.read)],
              ] as const
            ).map(([key, rows]) =>
              rows.length === 0 ? null : (
                <section key={key} data-testid={`notif-section-${key}`}>
                  <AppText
                    variant="label"
                    color="textMuted"
                    className="mb-[var(--spacing-xs)] block px-[2px]"
                  >
                    {t(key === "new" ? "notif.sectionNew" : "notif.sectionEarlier")}
                  </AppText>
                  <div className="overflow-hidden rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-card) [&>*+*]:border-(--color-line) [&>*+*]:border-t">
                    {rows.map((n) => (
                      <a
                        key={n.id}
                        href={target(n)}
                        onClick={
                          n.kind === NotificationKind.COACHING_SUMMARY
                            ? (e) => {
                                e.preventDefault();
                                void openSummary(n);
                              }
                            : undefined
                        }
                        data-testid="notif-row"
                        data-read={n.read ? "1" : "0"}
                        className={`block px-[var(--spacing-md)] py-[var(--spacing-md)] active:bg-(--color-surface-alt) ${
                          n.read ? "" : "bg-(--color-brand-muted)"
                        }`}
                      >
                        <div className="flex items-center gap-[var(--spacing-md)]">
                          <Avatar name={n.actor?.displayName} url={n.actor?.avatarUrl} size={40} />
                          <div className="min-w-0 flex-1">
                            <AppText
                              variant="body"
                              color={n.read ? "textMuted" : undefined}
                              className={`block ${n.read ? "" : "font-semibold"}`}
                            >
                              {sentence(n)}
                            </AppText>
                            {n.createdAt ? (
                              <AppText
                                variant="caption"
                                color="textMuted"
                                className="block"
                                data-testid="notif-when"
                              >
                                {notifWhen(Number(n.createdAt.seconds) * 1000)}
                              </AppText>
                            ) : null}
                          </div>
                          {n.read ? null : (
                            <span
                              className="h-2 w-2 shrink-0 rounded-full bg-(--color-brand)"
                              aria-hidden="true"
                            />
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                </section>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
