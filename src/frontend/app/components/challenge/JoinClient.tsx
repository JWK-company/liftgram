"use client";
// 그룹 챌린지 초대(SPEC-064 · SRS-118) — /challenges/join/<token>.
//
// 요약은 비로그인도 본다(인원 수만 · 멤버 이름 없음). 참가는 로그인 뒤 「참가」를 눌러서만(링크만 열어 자동 참가하지 않는다).
// 로그인이 안 돼 있으면 이 자리에서 로그인·가입하고 같은 주소로 돌아온다(소셜은 returnTo).
import type { GetInviteInfoResponse } from "@app/contracts";
import { Code, ConnectError } from "@connectrpc/connect";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  challengeClient,
  challengeDay,
  dayLabel,
  lastDayOf,
  MAX_MEMBERS,
  ruleLine,
} from "@/lib/challengeClient";
import { errorText } from "@/lib/errorText";
import { t } from "@/lib/i18n";
import type { LastLogin } from "@/lib/last-login";
import { navigate } from "@/lib/nav";
import { useAuth } from "../AuthProvider";
import AuthClient from "../profile/AuthClient";
import { useToast } from "../Toast";
import { BackLink } from "../ui/BackLink";
import { Button } from "../ui/Button";
import { ScreenHeader } from "../ui/ScreenHeader";
import { ErrorLine } from "./parts";
import { forgetMine } from "./ChallengeEntry";

export default function JoinClient({
  token,
  siteKey,
  preview,
  lastLogin,
}: {
  token: string;
  siteKey: string;
  preview: string[];
  lastLogin: LastLogin | null;
}) {
  const { user, loading, restoring } = useAuth();
  const toast = useToast();
  const [inv, setInv] = useState<GetInviteInfoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 없는·바뀐 토큰(NotFound)만 「열 수 없는 링크」 — 망·서버 오류는 다시 시도(REV-161 M-3)
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  // 늦게 온 옛 응답이 새 응답을 덮지 않게(로그인 전후 · REV-161 L-2)
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setError(null);
    setInvalid(false);
    try {
      const r = await challengeClient().getInviteInfo({ token });
      if (my === seq.current) setInv(r);
    } catch (e) {
      if (my !== seq.current) return;
      if (e instanceof ConnectError && e.code === Code.NotFound) setInvalid(true);
      else setError(errorText(e));
    }
  }, [token]);

  // 로그인 상태가 바뀌면 다시 읽는다(「이미 멤버」 여부가 달라진다)
  // biome-ignore lint/correctness/useExhaustiveDependencies: user?.id 는 다시 읽는 신호(본문에서 쓰지 않는다)
  useEffect(() => {
    if (!loading && !restoring) void load();
  }, [load, loading, restoring, user?.id]);

  async function join() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await challengeClient().join({ token });
      forgetMine();
      navigate(`/challenges/${encodeURIComponent(r.id)}`, { replace: true });
    } catch (e) {
      toast(errorText(e), "error");
      setBusy(false);
    }
  }

  const rule = inv?.rule;
  // 시작 시각(시작일 04:00)이 지났으면 상태가 아직 모집 중이어도 서버가 받지 않는다(REV-161 L-4)
  const started = !!rule && challengeDay(Date.now()) >= rule.startsOn;
  const full = !!inv && inv.memberCount >= MAX_MEMBERS;
  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("challenge.join.title")}
        back={<BackLink fallbackHref="/challenges" testId="join-back" />}
      />
      <div
        className="flex flex-col gap-[var(--spacing-lg)] p-[var(--spacing-lg)]"
        data-testid="challenge-join"
      >
        {invalid ? (
          <div data-testid="join-invalid">
            <ErrorLine message={t("challenge.join.invalid")} />
          </div>
        ) : error ? (
          <div data-testid="join-error">
            <ErrorLine message={error} onRetry={() => void load()} />
          </div>
        ) : !inv || !rule ? (
          <div className="h-40" aria-hidden />
        ) : (
          <>
            <div className="flex flex-col gap-[var(--spacing-xs)]">
              <h2 className="font-bold text-[length:var(--text-lg)]" data-testid="join-title">
                {rule.title}
              </h2>
              <p className="text-(--color-ink2) text-[length:var(--text-sm)]">{ruleLine(rule)}</p>
              <p className="text-(--color-ink2) text-[length:var(--text-sm)]">
                {`${dayLabel(rule.startsOn)} ~ ${dayLabel(lastDayOf(rule))}`}
              </p>
              <p className="text-(--color-ink2) text-[length:var(--text-sm)]" data-testid="join-count">
                {t("challenge.join.count", { n: inv.memberCount, max: MAX_MEMBERS })}
              </p>
              {rule.penaltyText ? (
                <p className="text-[length:var(--text-sm)]" data-testid="join-penalty">
                  {t("challenge.join.penalty", { text: rule.penaltyText })}
                </p>
              ) : null}
            </div>
            <ul className="flex list-disc flex-col gap-[2px] pl-[var(--spacing-lg)] text-(--color-ink2) text-[length:var(--text-sm)]">
              <li>{t("challenge.join.rule1", { n: rule.minSets, m: rule.minSets * 2 })}</li>
              {rule.proofMode !== "record" ? <li>{t("challenge.join.rule2")}</li> : null}
              <li>{t("challenge.join.rule3")}</li>
              {/* SPEC-064 위험 — 2명 그룹은 한 명의 이의로 무효가 된다는 것을 참가 전에(REV-161 M-4) */}
              {inv.memberCount <= 2 ? (
                <li data-testid="join-two-note">{t("challenge.detail.twoNote")}</li>
              ) : null}
              <li>{t("challenge.join.rule4")}</li>
            </ul>
            {inv.status !== "recruiting" || (started && !inv.alreadyMember) ? (
              <p className="font-semibold" data-testid="join-closed">
                {/* [원본] t("challenge.join.closed", { status: statusLabel(inv.status) }) — 상태 이름을 끼우면 문장이 깨졌다(REV-161 M-5) */}
                {inv.status === "ended"
                  ? t("challenge.join.closedEnded")
                  : inv.status === "cancelled"
                    ? t("challenge.join.closedCancelled")
                    : t("challenge.join.closedActive")}
              </p>
            ) : loading || restoring ? (
              <div className="h-12" aria-hidden />
            ) : !user ? (
              <div className="flex flex-col gap-[var(--spacing-sm)]" data-testid="join-need-login">
                <p className="font-semibold">{t("challenge.join.needLogin")}</p>
                <AuthClient
                  siteKey={siteKey}
                  preview={preview}
                  lastLogin={lastLogin}
                  returnTo={`/challenges/join/${encodeURIComponent(token)}`}
                  hideAppContinue
                />
              </div>
            ) : inv.alreadyMember ? (
              <Button
                title={t("challenge.join.open")}
                onPress={() => navigate(`/challenges/${encodeURIComponent(inv.id)}`, { replace: true })}
                testId="join-open"
              />
            ) : (
              <div className="flex flex-col gap-[var(--spacing-xs)]">
                <Button
                  title={t("challenge.join.join")}
                  onPress={() => void join()}
                  loading={busy}
                  disabled={full}
                  testId="join-submit"
                />
                {full ? (
                  <p className="text-(--color-ink2) text-[length:var(--text-sm)]" data-testid="join-full">
                    {t("challenge.join.full")}
                  </p>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
