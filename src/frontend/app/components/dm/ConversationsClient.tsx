"use client";
// @plm SRS-017  대화 목록 — app의 features/social/ConversationsScreen.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 한 줄에 아바타 · 제목 · 마지막 메시지 · 안 읽은 수 배지.
//
// ── 1:1의 제목은 서버가 주지 않는다 ─────────────────────────────────────────
// 그룹만 제목을 갖는다. 1:1은 **보는 사람에 따라 제목이 다르다**(상대 이름) —
// 그래서 서버가 정할 수 없고, 화면이 참여자에서 만든다.
//
// ── 왜 주기적으로 다시 읽나 ─────────────────────────────────────────────────
// 목록에는 실시간 스트림을 걸지 않는다(대화방마다 열면 연결이 사람 수만큼 는다).
// 대신 15초마다 조용히 다시 읽는다 — app이 하던 것과 같다.
// ─────────────────────────────────────────────────────────────────────────────
import type { Conversation } from "@app/contracts";
import { routes } from "@app/contracts";
import { useCallback, useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { dmClient } from "@/lib/dmClient";
import { useAuth } from "../AuthProvider";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { ListState } from "../ui/ListState";
import { AppText, Card } from "../ui/primitives";
import { ScreenHeader } from "../ui/ScreenHeader";

/** 1:1이면 상대 이름, 그룹이면 제목(없으면 참여자 이름들). */
export function conversationTitle(c: Conversation, meId: string | null): string {
  if (c.title) return c.title;
  const others = c.participants.filter((p) => p.id !== meId);
  const names = (others.length ? others : c.participants).map((p) => p.displayName || t("discover.unnamed"));
  return names.join(", ");
}

export default function ConversationsClient() {
  const { user, loading: authLoading } = useAuth();
  const meId = user?.id ?? null;
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await dmClient().listConversations({});
      setConvs(res.conversations);
      setError(false);
    } catch {
      if (!quiet) setError(true);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // **신원이 정해진 뒤에** 부른다. 새로고침 직후에는 access 토큰이 아직 없어서,
    // 여기서 먼저 쏘면 401 → 갱신 → 재시도로 돌아가는데, 그 갱신이 다른 곳(동기·프로필)의
    // 갱신과 겹치면 회전한 토큰이 서로를 무효로 만들어 **목록이 "불러오지 못했어요"로 끝난다**.
    if (authLoading) return;
    void load();
    // 조용한 재동기 — 새 메시지가 와도 목록의 배지가 따라온다.
    const timer = setInterval(() => void load(true), 15_000);
    return () => clearInterval(timer);
  }, [authLoading, load]);

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("dm.title")}
        back={
          <a href="/feed" aria-label={t("feed.title")} data-testid="dm-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
        right={
          <a href="/messages/new" aria-label={t("group.title")} data-testid="dm-new-group">
            <Icon name="people-outline" size={22} color="var(--color-brand)" />
          </a>
        }
      />

      <div className="flex-1 p-[var(--spacing-lg)] pt-[var(--spacing-md)]" data-testid="dm-list">
        {convs.length === 0 ? (
          <ListState
            loading={loading}
            error={error}
            onRetry={load}
            skeletonVariant="row"
            emptyIcon="chatbubbles-outline"
            emptyTitle="dm.emptyTitle"
            emptyMessage="dm.emptyMessage"
            emptyAction={
              <Button
                title={t("dm.emptyCta")}
                icon="people-outline"
                variant="secondary"
                fullWidth={false}
                onPress={() => {
                  location.href = "/discover";
                }}
                testId="dm-empty-discover"
              />
            }
          />
        ) : (
          convs.map((c) => {
            const title = conversationTitle(c, meId);
            const preview = c.lastMessage ? c.lastMessage.body || t("dm.imageMessage") : "";
            return (
              <a key={c.id} href={routes.conversation(c.id)} data-testid="dm-row">
                <Card className="mb-[var(--spacing-sm)]">
                  <div className="flex items-center gap-[var(--spacing-md)]">
                    <Avatar name={title} size={44} />
                    <span className="min-w-0 flex-1">
                      <AppText variant="body" className="block truncate font-medium!">
                        {title}
                      </AppText>
                      <AppText variant="caption" color="textMuted" className="mt-[2px] block truncate">
                        {preview}
                      </AppText>
                    </span>
                    {c.unreadCount > 0 ? (
                      <span
                        data-testid="dm-unread"
                        className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-(--color-brand) px-[6px]"
                      >
                        <AppText variant="label" style={{ color: "var(--color-on-brand)" }}>
                          {String(c.unreadCount)}
                        </AppText>
                      </span>
                    ) : null}
                  </div>
                </Card>
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}
