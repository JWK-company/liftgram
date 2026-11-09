"use client";
// 코치의 「초대 코드」 카드(SPEC-050 P1b) — 코치(trainer_intent)에게만 보인다.
//
//   없으면      「코드 만들기」(이 화면의 주 버튼)
//   있으면      코드 4-4 크게 · 「링크 복사」 · 「공유」(navigator.share 있을 때) · 「새로 만들기」(확인 — 옛 코드는 못 씀) · 만료일
//
// 판단은 GetMyInvite 응답이 온 뒤에 한다 — 읽는 동안 「코드 만들기」를 잠깐 그렸다 바꾸지 않는다(깜빡임 금지).
import type { Invite } from "@app/contracts";
import { useCallback, useEffect, useState } from "react";
import { coachingClient } from "@/lib/coachingClient";
import { expiryLabel, formatInviteCode, inviteLink } from "@/lib/coaching";
import { errorText } from "@/lib/errorText";
import { lang, t } from "@/lib/i18n";
import { useToast } from "../Toast";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/Dialog";
import { LogoSpinner } from "../ui/LogoSpinner";
import { AppText, Card } from "../ui/primitives";

export function InviteCard() {
  const toast = useToast();
  // undefined = 아직 읽는 중 · null = 코드 없음(정상 응답) — 「코드 만들기」는 이때만
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined);
  // 읽기 실패 — 「코드 없음」으로 치지 않는다(이미 코드가 있는데 「만들기」를 눌러 옛 코드를 죽이지 않게)
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRenew, setConfirmRenew] = useState(false);
  const [canShare, setCanShare] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    setInvite(undefined);
    try {
      const res = await coachingClient().getMyInvite({});
      setInvite(res.invite?.code ? res.invite : null);
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, []);

  useEffect(() => {
    void load();
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, [load]);

  async function create() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await coachingClient().createInvite({});
      setInvite(res.invite ?? null);
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      toast(t("coaching.invite.copied"));
    } catch {
      // 보안 창이 아니거나 권한이 없으면 — 링크를 그대로 보여 준다(손으로 복사)
      toast(t("coaching.invite.copyFailed", { link }), "error");
    }
  }

  async function share(link: string, code: string) {
    try {
      await navigator.share({
        title: t("coaching.invite.title"),
        text: t("coaching.invite.shareText", { code }),
        url: link,
      });
    } catch {
      // 사용자가 닫음 — 아무것도 하지 않는다
    }
  }

  const code = invite?.code ?? "";
  const shown = formatInviteCode(code);
  const link = code ? inviteLink(code) : "";

  return (
    <Card className="mb-[var(--spacing-lg)]" data-testid="invite-card">
      <AppText variant="label" color="textMuted" className="block">
        {t("coaching.invite.title")}
      </AppText>
      {loadError !== null ? (
        <div data-testid="invite-error" className="mt-[var(--spacing-xs)]">
          <AppText variant="caption" color="textMuted" className="block">
            {loadError}
          </AppText>
          <div className="mt-[var(--spacing-md)]">
            <Button
              title={t("coaching.invite.reload")}
              icon="refresh"
              variant="secondary"
              onPress={() => void load()}
              testId="invite-reload"
            />
          </div>
        </div>
      ) : invite === undefined ? (
        <div className="flex justify-center py-[var(--spacing-md)]">
          <span role="status" className="inline-flex" data-testid="invite-loading">
            <LogoSpinner size={28} label={t("common.loading")} />
          </span>
        </div>
      ) : invite === null ? (
        <>
          <AppText variant="caption" color="textMuted" className="mt-[var(--spacing-xs)] block">
            {t("coaching.invite.empty")} {t("coaching.invite.hint")}
          </AppText>
          <div className="mt-[var(--spacing-md)]">
            <Button
              title={t("coaching.invite.create")}
              loading={busy}
              onPress={() => void create()}
              testId="invite-create"
            />
          </div>
        </>
      ) : (
        <>
          <div
            data-testid="invite-code"
            data-code={code}
            className="mt-[var(--spacing-sm)] break-all text-center font-bold font-mono text-(--color-coaching-ink) text-[length:var(--text-xxl)] tracking-[0.12em]"
          >
            {shown}
          </div>
          <AppText
            variant="caption"
            color="textMuted"
            className="mt-[2px] block text-center"
            data-testid="invite-expires"
          >
            {t("coaching.invite.expires", { date: expiryLabel(Number(invite.expiresAt), lang) })}
          </AppText>
          <AppText variant="caption" color="textFaint" className="mt-[var(--spacing-xs)] block text-center">
            {t("coaching.invite.hint")}
          </AppText>
          <div className="mt-[var(--spacing-md)] flex flex-wrap gap-[var(--spacing-sm)]">
            <div className="min-w-[120px] flex-1">
              <Button
                title={t("coaching.invite.copy")}
                icon="clipboard-outline"
                variant="secondary"
                onPress={() => void copy(link)}
                testId="invite-copy"
              />
            </div>
            {canShare ? (
              <div className="min-w-[120px] flex-1">
                <Button
                  title={t("coaching.invite.share")}
                  icon="share-social-outline"
                  variant="secondary"
                  onPress={() => void share(link, shown)}
                  testId="invite-share"
                />
              </div>
            ) : null}
          </div>
          {/* 링크 원문 — 복사가 막힌 기기에서 길게 눌러 고를 수 있게 · 시험이 읽는 자리 */}
          <AppText
            variant="caption"
            color="textFaint"
            className="mt-[var(--spacing-xs)] block break-all text-center"
            data-testid="invite-link"
          >
            {link}
          </AppText>
          <div className="mt-[var(--spacing-xs)] flex justify-center">
            <Button
              title={t("coaching.invite.renew")}
              variant="quiet"
              size="sm"
              fullWidth={false}
              disabled={busy}
              onPress={() => setConfirmRenew(true)}
              testId="invite-renew"
              className="min-h-11"
            />
          </div>
        </>
      )}
      {confirmRenew ? (
        <ConfirmDialog
          testId="invite-renew-confirm"
          title={t("coaching.invite.renewTitle")}
          message={t("coaching.invite.renewMessage")}
          confirmLabel={t("coaching.invite.renew")}
          onCancel={() => setConfirmRenew(false)}
          onConfirm={() => {
            setConfirmRenew(false);
            void create();
          }}
        />
      ) : null}
    </Card>
  );
}
