"use client";
// 의견 보내기(SPEC-032) — 로그인한 사용자라면 역할과 무관하게 쓴다. 운영 피드백과 섞이지 않는다.
// 쓰던 글을 잃지 않는 것이 먼저다. 초안은 이 기기에 두고, 실패·상한 초과에도 본문을 지우지 않으며 성공했을 때만 지운다.
import { useEffect, useState } from "react";
import { APP_VERSION } from "@/lib/appUpdate";
import { feedbackClient } from "@/lib/feedbackClient";
import { feedErrorMessage } from "@/lib/feedClient";
import { t } from "@/lib/i18n";
import { nativeOS } from "@/lib/native";
import { CONTACT_EMAIL } from "../legal/LegalPage";
import { useAuth } from "../AuthProvider";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { TextArea } from "../ui/inputs";
import { LogoSpinner } from "../ui/LogoSpinner";
import { AppText, EmptyState } from "../ui/primitives";
import { ScreenHeader } from "../ui/ScreenHeader";
import { trackUsage } from "@/lib/usage";

const DRAFT_KEY = "liftgram.feedback.draft";
const MAX_BODY = 2000;
const MIN_BODY = 2;

function readDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(text: string) {
  try {
    if (text) localStorage.setItem(DRAFT_KEY, text);
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // 저장소가 막힌 브라우저에서는 초안만 포기한다. 화면의 글은 그대로다.
  }
}

export default function UserFeedbackClient() {
  const { user, loading } = useAuth();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    setBody(readDraft());
  }, []);

  const valid = body.trim().length >= MIN_BODY && body.length <= MAX_BODY;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      await feedbackClient().submitUserFeedback({
        body: body.trim(),
        appVersion: APP_VERSION,
        platform: nativeOS() ?? "web",
      });
      trackUsage("feedback_send");
      writeDraft("");
      setBody("");
      setSent(true);
    } catch (e) {
      setError(feedErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("userFeedback.title")}
        back={
          <a href="/profile" aria-label={t("profile.title")} data-testid="user-feedback-back">
            <Icon name="chevron-back" size={24} color="var(--color-ink)" />
          </a>
        }
      />
      <div className="flex-1 p-[var(--spacing-lg)]" data-testid="user-feedback-screen">
        {loading && !user ? (
          <div className="flex justify-center py-[var(--spacing-xl)]" role="status">
            <LogoSpinner size={32} label={t("userFeedback.title")} />
          </div>
        ) : !user ? (
          <div data-testid="user-feedback-login">
            <EmptyState
              icon="lock-closed-outline"
              title={t("feed.loginRequiredTitle")}
              message={t("userFeedback.loginMessage")}
              action={
                <a href="/account?next=/profile/feedback" data-testid="user-feedback-login-link">
                  <Button title={t("auth.login")} variant="secondary" fullWidth={false} />
                </a>
              }
            />
          </div>
        ) : (
          <>
            {/* [원본] <AppText variant="body" className="mb-[var(--spacing-sm)] block">
              {t("userFeedback.intro")}
            </AppText> */}
            {/* [개선] 설명 줄 없앰(SPEC-055 Phase 4) */}
            <AppText variant="caption" color="textMuted" className="mb-[var(--spacing-lg)] block">
              {t("userFeedback.privacy")}
            </AppText>
            {sent ? (
              <div
                role="status"
                data-testid="user-feedback-sent"
                // [원본] className="mb-[var(--spacing-md)] rounded-[var(--radius-sm)] bg-(--color-surface-alt) p-[var(--spacing-md)]" — 회색 판
                // [개선] 판 대신 왼쪽 초록 강조선(보냈음 · SPEC-056 F1·F6)
                style={{ boxShadow: "inset 3px 0 0 var(--color-ok)" }}
                className="mb-[var(--spacing-md)] py-[var(--spacing-sm)] pl-[var(--spacing-md)]"
              >
                <AppText variant="body">{t("userFeedback.sent")}</AppText>
              </div>
            ) : null}
            <TextArea
              label={t("userFeedback.bodyLabel")}
              placeholder={t("userFeedback.placeholder")}
              value={body}
              rows={8}
              maxLength={MAX_BODY}
              onChange={(e) => {
                setBody(e.target.value);
                writeDraft(e.target.value);
                setSent(false);
                setError("");
              }}
              testId="user-feedback-body"
            />
            <div className="mb-[var(--spacing-md)] text-right">
              <AppText variant="caption" color="textMuted">
                {`${body.length} / ${MAX_BODY}`}
              </AppText>
            </div>
            {error ? (
              <div role="alert" data-testid="user-feedback-error" className="mb-[var(--spacing-md)]">
                <AppText variant="caption" color="danger">
                  {error}
                </AppText>
              </div>
            ) : null}
            <Button
              title={t("userFeedback.submit")}
              icon="send-outline"
              onPress={submit}
              loading={busy}
              disabled={!valid}
              testId="user-feedback-submit"
            />
            <AppText variant="caption" color="textMuted" className="mt-[var(--spacing-lg)] block">
              {t("userFeedback.contact", { email: CONTACT_EMAIL })}
            </AppText>
          </>
        )}
      </div>
    </div>
  );
}
