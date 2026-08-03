"use client";
// @plm SRS-006  개발 피드백 탭 — app의 features/feedback/FeedbackTabScreen.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 내부 사람(coworker·admin)만 쓰는 탭이다. **여기서 막는 것은 경계가 아니라 안내**다 —
// 진짜 인가는 서버가 한다. 그래도 세 상태를 갈라 보여 준다:
//
//	· 아직 모른다(세션 확인 중)   → 기다린다
//	· 로그인하지 않았다           → 로그인하라고 한다
//	· 로그인했지만 역할이 아니다  → 권한이 없다고 한다
//
// 셋을 뭉뚱그려 "권한 없음"으로 보이면, 로그인만 하면 되는 사람이 포기한다.
//
// ── 목록 실패와 권한 실패를 구분한다 ────────────────────────────────────────
// 아이디어보드가 죽은 것은 우리 잘못이 아니다 — 그때는 **다시 시도**를 권한다.
// (서버가 그 실패만 Unavailable로 따로 표시해 준다.)
// ─────────────────────────────────────────────────────────────────────────────
import { Role, type FeedbackItem } from "@app/contracts";
import { FeedbackCategory, FeedbackState } from "@app/contracts";
import { useCallback, useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { feedbackClient } from "@/lib/feedbackClient";
import { useAuth } from "./AuthProvider";
import { useToast } from "./Toast";
import { Button } from "./ui/Button";
import { TextArea, TextField } from "./ui/inputs";
import { ListState } from "./ui/ListState";
import { AppText, Card, EmptyState, Tag, type TagTone } from "./ui/primitives";
import { ScreenHeader } from "./ui/ScreenHeader";

/** 이 탭을 쓸 수 있는 역할. 서버의 판단과 **같은 목록**이어야 한다. */
export function isInsider(role: Role | undefined): boolean {
  return role === Role.COWORKER || role === Role.ADMIN;
}

/** 상태 배지 색 — 완료=초록·진행=앰버·반려=빨강. 분류 태그(파랑)와 확실히 갈린다. */
function stateTone(state: FeedbackState): TagTone {
  switch (state) {
    case FeedbackState.ADOPTED:
      return "success";
    case FeedbackState.VOTING:
    case FeedbackState.DISCUSSION:
      return "warning";
    case FeedbackState.REJECTED:
      return "danger";
    default:
      return "muted";
  }
}

/** 아는 상태는 우리 문구로, 모르는 상태는 **보드가 준 원문 그대로** 보여 준다(빈칸 방지). */
function stateLabel(item: FeedbackItem): string {
  switch (item.state) {
    case FeedbackState.SUBMITTED:
      return t("feedback.state.submitted");
    case FeedbackState.DISCUSSION:
      return t("feedback.state.discussion");
    case FeedbackState.VOTING:
      return t("feedback.state.voting");
    case FeedbackState.ADOPTED:
      return t("feedback.state.adopted");
    case FeedbackState.REJECTED:
      return t("feedback.state.rejected");
    case FeedbackState.HOLD:
      return t("feedback.state.hold");
    default:
      return item.stateRaw || "—";
  }
}

export default function FeedbackClient() {
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const allowed = isInsider(user?.role);

  const [category, setCategory] = useState<FeedbackCategory>(FeedbackCategory.BUG);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setItems((await feedbackClient().list({})).items);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 신원이 확정되기 전에 부르면 서버가 401로 되받는다 — 권한을 알고 나서 부른다.
    if (authLoading || !allowed) {
      setLoading(false);
      return;
    }
    void load();
  }, [authLoading, allowed, load]);

  const valid = title.trim().length >= 3 && detail.trim().length >= 5;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await feedbackClient().submit({ category, title: title.trim(), detail: detail.trim() });
      setTitle("");
      setDetail("");
      toast(t("feedback.submitSuccessMessage"));
      void load();
    } catch {
      toast(t("feedback.errorMessage"), "error");
    } finally {
      setBusy(false);
    }
  }

  if (authLoading) {
    return (
      <Gate>
        <span
          role="status"
          className="h-5 w-5 animate-spin rounded-full border-2 border-(--color-brand) border-t-transparent"
        />
      </Gate>
    );
  }

  // 로그인만 하면 될 사람과 역할이 없는 사람을 갈라 안내한다.
  if (!user) {
    return (
      <Gate>
        <EmptyState
          icon="lock-closed-outline"
          title={t("coaching.loginRequiredTitle")}
          message={t("coaching.loginRequiredMessage")}
          action={
            <a href="/account">
              <Button title={t("auth.login")} variant="secondary" fullWidth={false} />
            </a>
          }
        />
      </Gate>
    );
  }
  if (!allowed) {
    return (
      <Gate>
        <EmptyState
          icon="lock-closed-outline"
          title={t("feedback.noAccessTitle")}
          message={t("feedback.noAccessMessage")}
        />
      </Gate>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title={t("feedback.title")} />

      <div className="flex-1 p-[var(--spacing-lg)]" data-testid="feedback-body">
        <AppText variant="caption" color="textMuted" className="mb-[var(--spacing-lg)] block">
          {t("feedback.intro")}
        </AppText>

        <Card className="mb-[var(--spacing-xl)]">
          <AppText variant="label" color="textMuted" className="mb-[var(--spacing-xs)] block">
            {t("feedback.category")}
          </AppText>
          <div className="mb-[var(--spacing-md)] flex gap-[var(--spacing-sm)]">
            <CatChip
              label={t("feedback.cat.bug")}
              active={category === FeedbackCategory.BUG}
              onPress={() => setCategory(FeedbackCategory.BUG)}
              testId="feedback-cat-bug"
            />
            <CatChip
              label={t("feedback.cat.improvement")}
              active={category === FeedbackCategory.IMPROVEMENT}
              onPress={() => setCategory(FeedbackCategory.IMPROVEMENT)}
              testId="feedback-cat-improvement"
            />
          </div>

          <TextField
            label={t("feedback.titleLabel")}
            placeholder={t("feedback.titlePlaceholder")}
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            testId="feedback-title"
          />
          <TextArea
            label={t("feedback.detailLabel")}
            placeholder={t("feedback.detailPlaceholder")}
            value={detail}
            rows={6}
            maxLength={4000}
            onChange={(e) => setDetail(e.target.value)}
            testId="feedback-detail"
          />
          <Button
            title={t("feedback.submit")}
            icon="send-outline"
            onPress={submit}
            loading={busy}
            disabled={!valid}
            testId="feedback-submit"
          />
        </Card>

        <AppText variant="heading" className="mb-[var(--spacing-md)] block">
          {t("feedback.listTitle")}
        </AppText>

        {items.length === 0 ? (
          <ListState
            loading={loading}
            error={error}
            onRetry={load}
            skeletonVariant="row"
            emptyIcon="chatbox-ellipses-outline"
            emptyTitle="feedback.empty"
            emptyMessage="feedback.emptyMessage"
          />
        ) : (
          <div data-testid="feedback-list">
            {items.map((item) => (
              <Card key={String(item.id)} className="mb-[var(--spacing-md)]">
                <div className="flex flex-wrap items-center gap-[var(--spacing-xs)]">
                  <Tag
                    label={
                      item.category === FeedbackCategory.BUG
                        ? t("feedback.cat.bug")
                        : t("feedback.cat.improvement")
                    }
                    tone={item.category === FeedbackCategory.BUG ? "pr" : "primary"}
                  />
                  <Tag label={stateLabel(item)} tone={stateTone(item.state)} />
                  {item.mine ? <Tag label={t("feedback.mine")} tone="muted" /> : null}
                </div>
                <AppText variant="body" className="mt-[var(--spacing-sm)] block font-medium!">
                  {item.title}
                </AppText>
                {item.detail ? (
                  <AppText variant="caption" color="textMuted" className="mt-[2px] line-clamp-3 block">
                    {item.detail}
                  </AppText>
                ) : null}
                {item.promotedCode ? (
                  <AppText variant="label" color="primary" className="mt-[var(--spacing-sm)] block">
                    {t("feedback.promoted", { code: item.promotedCode })}
                  </AppText>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader title={t("feedback.title")} />
      <div
        className="flex flex-1 items-center justify-center p-[var(--spacing-lg)]"
        data-testid="feedback-gate"
      >
        {children}
      </div>
    </div>
  );
}

function CatChip({
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
      className={`flex flex-1 items-center justify-center rounded-[var(--radius-md)] border py-[var(--spacing-sm)] ${
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
