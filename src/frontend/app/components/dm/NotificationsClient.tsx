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
import { t } from "@/lib/i18n";
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
    default:
      return t("notif.generic", { name });
  }
}

/** 눌렀을 때 갈 곳 — 팔로우는 그 사람, 좋아요·댓글은 그 글. */
function target(n: Notification): string {
  if (n.kind === NotificationKind.FOLLOW) return routes.userProfile(n.actor?.id ?? "");
  if (n.kind === NotificationKind.COACHING_SUMMARY) return "/messages"; // 실제 이동은 openSummary(그 회원과의 대화) @plm SRS-080
  return n.postId ? routes.postComments(n.postId) : "/feed";
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
          // 줄 목록(SRS-054): 안 읽은 줄은 옅은 브랜드 바탕 + 점 — 읽음 표시가 약하던 것(29개 표).
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-card) [&>*+*]:border-(--color-line) [&>*+*]:border-t">
            {items.map((n) => (
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
                className={`block px-[var(--spacing-md)] py-[var(--spacing-md)] active:bg-(--color-surface-alt) ${
                  n.read ? "" : "bg-(--color-brand-muted)"
                }`}
              >
                <div className="flex items-center gap-[var(--spacing-md)]">
                  <Avatar name={n.actor?.displayName} url={n.actor?.avatarUrl} size={40} />
                  <AppText variant="body" className="min-w-0 flex-1">
                    {sentence(n)}
                  </AppText>
                  {/* 안 읽은 것은 점 하나로만 구분한다 — 목록이 요란해지지 않게. */}
                  {n.read ? null : <span className="h-2 w-2 shrink-0 rounded-full bg-(--color-brand)" />}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
