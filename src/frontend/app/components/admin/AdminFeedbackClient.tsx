"use client";
// 피드백 모아 보기(SPEC-032) — 사용자 의견과 운영 피드백은 칸이 나뉘어 섞이지 않는다.
// 본문은 신뢰할 수 없는 입력이라 일반 텍스트로만 그린다. 상태 변경 버튼은 관리자에게만 보이지만
// 경계는 서버다. 승인은 지금 아무것도 실행하지 않고, 승인 당시의 본문 해시와 메모만 남긴다.
import { FeedbackCategory, FeedbackKind, FeedbackStatus, Role, type FeedbackEntry } from "@app/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { feedbackClient } from "@/lib/feedbackClient";
import { feedErrorMessage } from "@/lib/feedClient";
import { t, type TransKey } from "@/lib/i18n";
import { isInsider } from "@/lib/staffRoles";
import { useAuth } from "../AuthProvider";
import { useToast } from "../Toast";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/inputs";
import { ListState } from "../ui/ListState";
import { LogoSpinner } from "../ui/LogoSpinner";
import { AppText, Card, Tag, type TagTone } from "../ui/primitives";
import { ScreenHeader } from "../ui/ScreenHeader";

const STATUS: Record<FeedbackStatus, { label: TransKey; tone: TagTone }> = {
  [FeedbackStatus.UNSPECIFIED]: { label: "admin.feedback.status.new", tone: "muted" },
  [FeedbackStatus.NEW]: { label: "admin.feedback.status.new", tone: "muted" },
  [FeedbackStatus.APPROVED]: { label: "admin.feedback.status.approved", tone: "primary" },
  [FeedbackStatus.REJECTED]: { label: "admin.feedback.status.rejected", tone: "danger" },
  [FeedbackStatus.IN_PROGRESS]: { label: "admin.feedback.status.inProgress", tone: "warning" },
  [FeedbackStatus.DONE]: { label: "admin.feedback.status.done", tone: "success" },
};

// 서버 전이표와 같은 값. 안내일 뿐이고 서버가 다시 판정한다.
const ACTIONS: Partial<Record<FeedbackStatus, { to: FeedbackStatus; label: TransKey; id: string }[]>> = {
  [FeedbackStatus.NEW]: [
    { to: FeedbackStatus.APPROVED, label: "admin.feedback.action.approve", id: "approve" },
    { to: FeedbackStatus.IN_PROGRESS, label: "admin.feedback.action.start", id: "start" },
    { to: FeedbackStatus.DONE, label: "admin.feedback.action.done", id: "done" },
    { to: FeedbackStatus.REJECTED, label: "admin.feedback.action.reject", id: "reject" },
  ],
  [FeedbackStatus.APPROVED]: [
    { to: FeedbackStatus.IN_PROGRESS, label: "admin.feedback.action.start", id: "start" },
    { to: FeedbackStatus.DONE, label: "admin.feedback.action.done", id: "done" },
    { to: FeedbackStatus.REJECTED, label: "admin.feedback.action.reject", id: "reject" },
  ],
  [FeedbackStatus.IN_PROGRESS]: [
    { to: FeedbackStatus.DONE, label: "admin.feedback.action.done", id: "done" },
    { to: FeedbackStatus.REJECTED, label: "admin.feedback.action.reject", id: "reject" },
  ],
  [FeedbackStatus.REJECTED]: [
    { to: FeedbackStatus.NEW, label: "admin.feedback.action.reopen", id: "reopen" },
  ],
};

export default function AdminFeedbackClient() {
  const { user, loading: authLoading } = useAuth();
  const allowed = isInsider(user?.role);
  const [kind, setKind] = useState<FeedbackKind>(FeedbackKind.USER);
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // 칸을 빠르게 오가도 늦게 온 옛 응답이 지금 칸을 덮지 않게 마지막 요청만 받는다.
  const lastRequest = useRef(0);
  const load = useCallback(async (k: FeedbackKind) => {
    lastRequest.current += 1;
    const mine = lastRequest.current;
    setLoading(true);
    setError(false);
    setEntries([]);
    try {
      const res = await feedbackClient().listEntries({ kind: k });
      if (mine === lastRequest.current) setEntries(res.entries);
    } catch {
      if (mine === lastRequest.current) setError(true);
    } finally {
      if (mine === lastRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !allowed) return;
    void load(kind);
  }, [authLoading, allowed, kind, load]);

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("admin.feedback.title")}
        back={
          <a href="/admin" aria-label={t("staff.title")} data-testid="admin-feedback-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
      />
      <div className="flex-1 p-[var(--spacing-lg)]" data-testid="admin-feedback-screen">
        {authLoading && !allowed ? (
          <div className="flex justify-center py-[var(--spacing-xl)]" role="status">
            <LogoSpinner size={32} label={t("admin.feedback.title")} />
          </div>
        ) : !allowed ? (
          <div className="py-[var(--spacing-xl)] text-center" data-testid="admin-feedback-denied">
            <AppText variant="body" color="danger">
              {t("ops.adminOnly")}
            </AppText>
          </div>
        ) : (
          <>
            <div className="mb-[var(--spacing-lg)] flex gap-[var(--spacing-sm)]">
              <KindChip
                label={t("admin.feedback.tabUser")}
                active={kind === FeedbackKind.USER}
                onPress={() => setKind(FeedbackKind.USER)}
                testId="admin-feedback-tab-user"
              />
              <KindChip
                label={t("admin.feedback.tabOps")}
                active={kind === FeedbackKind.OPS}
                onPress={() => setKind(FeedbackKind.OPS)}
                testId="admin-feedback-tab-ops"
              />
            </div>
            {entries.length === 0 ? (
              <div data-testid="admin-feedback-state">
                {/* key: 칸을 바꾸면 「이미 비어 있음」 기억을 지워 옛 칸의 빈 안내가 비치지 않게 한다 */}
                <ListState
                  key={kind}
                  loading={loading}
                  error={error}
                  onRetry={() => void load(kind)}
                  skeletonVariant="row"
                  emptyIcon="chatbox-ellipses-outline"
                  emptyTitle="admin.feedback.empty"
                />
              </div>
            ) : (
              <div data-testid="admin-feedback-list">
                {entries.map((e) => (
                  <EntryCard
                    key={String(e.id)}
                    entry={e}
                    canAct={user?.role === Role.ADMIN}
                    onChange={(next) => setEntries((cur) => cur.map((x) => (x.id === next.id ? next : x)))}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EntryCard({
  entry,
  canAct,
  onChange,
}: {
  entry: FeedbackEntry;
  canAct: boolean;
  onChange: (e: FeedbackEntry) => void;
}) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const status = STATUS[entry.status];
  const actions = canAct ? (ACTIONS[entry.status] ?? []) : [];

  async function move(to: FeedbackStatus) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await feedbackClient().setStatus({ id: entry.id, status: to, note: note.trim() });
      if (res.entry) onChange(res.entry);
      setNote("");
    } catch (err) {
      toast(feedErrorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-[var(--spacing-md)]">
      <div data-testid="admin-feedback-item" data-status={t(status.label)}>
        <div className="flex flex-wrap items-center gap-[var(--spacing-xs)]">
          {entry.category !== FeedbackCategory.UNSPECIFIED ? (
            <Tag
              label={t(
                entry.category === FeedbackCategory.BUG ? "feedback.cat.bug" : "feedback.cat.improvement",
              )}
              tone={entry.category === FeedbackCategory.BUG ? "pr" : "primary"}
            />
          ) : null}
          <Tag label={t(status.label)} tone={status.tone} />
        </div>
        {entry.title ? (
          <AppText variant="body" className="mt-[var(--spacing-sm)] block font-medium!">
            {entry.title}
          </AppText>
        ) : null}
        <AppText variant="body" className="mt-[var(--spacing-xs)] block whitespace-pre-wrap break-words">
          {entry.body}
        </AppText>
        <AppText variant="caption" color="textMuted" className="mt-[var(--spacing-xs)] block">
          {[
            entry.authorName,
            entry.platform,
            entry.appVersion,
            entry.createdAt ? new Date(Number(entry.createdAt.seconds) * 1000).toLocaleDateString() : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </AppText>
        {entry.resolution ? (
          <AppText
            variant="caption"
            color="textMuted"
            className="mt-[var(--spacing-xs)] block whitespace-pre-wrap break-words"
          >
            {t("admin.feedback.note", { note: entry.resolution })}
          </AppText>
        ) : null}
        {actions.length > 0 ? (
          <div className="mt-[var(--spacing-md)]">
            <TextField
              placeholder={t("admin.feedback.notePlaceholder")}
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              testId="admin-feedback-note"
            />
            <div className="flex flex-wrap gap-[var(--spacing-sm)]">
              {actions.map((a) => (
                <Button
                  key={a.id}
                  title={t(a.label)}
                  variant="secondary"
                  fullWidth={false}
                  disabled={busy}
                  onPress={() => void move(a.to)}
                  testId={`admin-feedback-${a.id}`}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function KindChip({
  label,
  active,
  onPress,
  testId,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      data-testid={testId}
      aria-pressed={active}
      className={`flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-md)] border py-[var(--spacing-sm)] ${
        active
          ? "border-(--color-brand) bg-(--color-brand)"
          : "border-(--color-line) bg-(--color-surface-alt)"
      }`}
    >
      <AppText variant="caption" style={{ color: active ? "var(--color-on-brand)" : "var(--color-ink2)" }}>
        {label}
      </AppText>
    </button>
  );
}
