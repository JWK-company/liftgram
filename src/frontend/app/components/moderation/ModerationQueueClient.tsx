"use client";
// @plm SRS-020  모더레이션 큐 — app의 features/social/ModerationQueueScreen.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 검토자가 훑는 화면이다. 한 줄에 **판단에 필요한 것만** 놓는다:
//   종류 배지 · 글쓴이 · (자동 감지면) 표시 · 사진/본문 미리보기 · 사유 칩·신고 건수 · 승인/제거
//
// 처리하면 그 줄을 목록에서 **바로 뺀다**. 다시 읽어 오면 스크롤이 튀고, 방금 판단한 것이
// 어디로 갔는지 알 수 없다.
//
// 권한이 없으면 서버가 거절한다 — 화면은 그 사실을 그대로 보여 준다(숨기지 않는다.
// 이 화면의 존재 자체는 비밀이 아니고, 감추면 "왜 안 되는지" 모르는 채로 남는다).
// ─────────────────────────────────────────────────────────────────────────────
import type { QueueItem } from "@app/contracts";
import { Action, Reason, TargetType } from "@app/contracts";
import { useCallback, useEffect, useState } from "react";
import { t, type TransKey } from "@/lib/i18n";
import { feedErrorMessage } from "@/lib/feedClient";
import { mediaSrc } from "@/lib/mediaClient";
import { moderationClient } from "@/lib/moderationClient";
import { useAuth } from "../AuthProvider";
import { useToast } from "../Toast";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { ListState } from "../ui/ListState";
import { AppText, Card, Tag } from "../ui/primitives";
import { ScreenHeader } from "../ui/ScreenHeader";

const REASON_KEY: Partial<Record<Reason, TransKey>> = {
  [Reason.SPAM]: "report.reason.spam",
  [Reason.NUDITY]: "report.reason.nudity",
  [Reason.HARASSMENT]: "report.reason.harassment",
  [Reason.VIOLENCE]: "report.reason.violence",
  [Reason.SELF_HARM]: "report.reason.self_harm",
  [Reason.MINOR_SAFETY]: "report.reason.minor_safety",
  [Reason.MISINFORMATION]: "report.reason.misinformation",
  [Reason.OTHER]: "report.reason.other",
};

function reasonLabel(r: Reason): string {
  const key = REASON_KEY[r];
  // 사람이 고른 사유가 아니면(자동 스캔) 그 사실을 그대로 적는다.
  return key ? t(key) : t("moderation.autoFlagged");
}

function targetLabel(kind: string, type: TargetType): string {
  if (kind === "story" || type === TargetType.STORY) return t("moderation.target.story");
  if (kind === "comment" || type === TargetType.COMMENT) return t("moderation.target.comment");
  return t("moderation.target.post");
}

export default function ModerationQueueClient() {
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await moderationClient().listQueue({});
      setItems(res.items);
    } catch (e) {
      setError(feedErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // 신원이 확정된 뒤에 부른다 — 새로고침 직후에는 access 토큰이 아직 없어서
  // 익명 요청이 나가고, 그러면 정당한 모더레이터도 거절당한 화면을 보게 된다.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      setError(t("feed.loginRequiredTitle"));
      return;
    }
    void load();
  }, [authLoading, user, load]);

  async function act(item: QueueItem, remove: boolean) {
    const key = `${item.targetType}:${item.targetId}`;
    if (busy) return;
    setBusy(key);
    try {
      await moderationClient().resolve({
        targetType: item.targetType,
        targetId: item.targetId,
        action: remove ? Action.REMOVE : Action.APPROVE,
      });
      // 판단한 줄은 바로 뺀다 — 다시 읽으면 스크롤이 튄다.
      setItems((prev) => prev.filter((i) => `${i.targetType}:${i.targetId}` !== key));
    } catch {
      toast(t("moderation.actionFailed"), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("moderation.title")}
        back={
          <a href="/profile" aria-label={t("profile.title")} data-testid="mod-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
      />

      <div className="flex-1 p-[var(--spacing-lg)] pt-[var(--spacing-md)]" data-testid="mod-list">
        {items.length === 0 ? (
          error ? (
            // 권한이 없거나 서버가 답하지 않은 경우 — 이유를 그대로 보여 준다.
            <div className="py-[var(--spacing-xl)] text-center" data-testid="mod-error">
              <AppText variant="body" color="danger">
                {error}
              </AppText>
            </div>
          ) : (
            <ListState
              loading={loading}
              skeletonVariant="post"
              emptyIcon="shield-checkmark-outline"
              emptyTitle="moderation.empty"
              emptyMessage="moderation.emptyMessage"
            />
          )
        ) : (
          items.map((item) => {
            const key = `${item.targetType}:${item.targetId}`;
            const text = item.preview?.text ?? "";
            const media = item.preview?.mediaUrl ?? "";
            return (
              <Card key={key} className="mb-[var(--spacing-md)]" data-testid="mod-item">
                <div className="flex items-center gap-[var(--spacing-sm)]">
                  <Tag label={targetLabel(item.preview?.kind ?? "", item.targetType)} tone="primary" />
                  <AppText variant="caption" color="textMuted" className="min-w-0 flex-1 truncate">
                    {item.author?.displayName || t("discover.unnamed")}
                  </AppText>
                  {item.source === "auto" ? <Tag label={t("moderation.autoFlagged")} tone="pr" /> : null}
                </div>

                {media ? (
                  // biome-ignore lint/performance/noImgElement: 검토용 원본 미리보기 — 최적화 대상이 아니다
                  <img
                    src={mediaSrc(media)}
                    alt=""
                    className="mt-[var(--spacing-sm)] h-[180px] w-full rounded-[var(--radius-md)] bg-(--color-surface-alt) object-cover"
                  />
                ) : null}
                {text ? (
                  <AppText variant="body" className="mt-[var(--spacing-sm)] block line-clamp-3">
                    {text}
                  </AppText>
                ) : null}

                <div className="mt-[var(--spacing-sm)] flex flex-wrap items-center gap-[var(--spacing-xs)]">
                  {item.reasons.map((r) => (
                    <span
                      key={r}
                      className="rounded-[var(--radius-pill)] bg-(--color-surface-alt) px-[var(--spacing-sm)] py-[2px]"
                    >
                      <AppText variant="label" color="textMuted">
                        {reasonLabel(r)}
                      </AppText>
                    </span>
                  ))}
                  {item.reportCount > 0 ? (
                    <AppText variant="label" color="textFaint">
                      {t("moderation.reports", { count: item.reportCount })}
                    </AppText>
                  ) : null}
                </div>

                <div className="mt-[var(--spacing-md)] flex gap-[var(--spacing-sm)]">
                  <div className="flex-1">
                    <Button
                      title={t("moderation.approve")}
                      variant="secondary"
                      size="sm"
                      loading={busy === key}
                      disabled={!!busy}
                      onPress={() => act(item, false)}
                      testId="mod-approve"
                    />
                  </div>
                  <div className="flex-1">
                    <Button
                      title={t("moderation.remove")}
                      variant="danger"
                      size="sm"
                      loading={busy === key}
                      disabled={!!busy}
                      onPress={() => act(item, true)}
                      testId="mod-remove"
                    />
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
