"use client";
// 이달의 리프터 쿠폰(SPEC-063) — /awards/[id]. 본인 수상만 열린다(남의 것은 서버가 not found).
// 번호는 가려 두고 「번호 보기」로 연다(어깨 너머·화면 공유 · REV-153 화면 M4). 복사가 안 되는 웹뷰에서는 길게 눌러 고르라고 안내한다.
import type { MyAward } from "@app/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { lang, t } from "@/lib/i18n";
import { awardClient, monthLabel } from "@/lib/awardClient";
import { useAuth } from "../AuthProvider";
import { useToast } from "../Toast";
import { BackLink } from "../ui/BackLink";
import { actionBoxClass, Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { ScreenHeader } from "../ui/ScreenHeader";
import { categoryLabel } from "./parts";

function day(ts?: { seconds: bigint }): string {
  if (!ts) return "";
  const d = new Date(Number(ts.seconds) * 1000);
  // [원본] return d.toLocaleDateString("ko-KR");
  // [개선] 앱 언어를 따른다(REV-155 화면 8)
  return d.toLocaleDateString(lang === "en" ? "en-US" : "ko-KR", { timeZone: "Asia/Seoul" });
}

export default function AwardCouponClient({ id }: { id: string }) {
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const [award, setAward] = useState<MyAward | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing" | "error">("loading");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const seq = useRef(0);

  // 늦게 온 응답(그새 로그아웃·계정 바뀜·다시 시도)은 버린다 — 옛 사람의 번호가 다시 열리지 않게(REV-155 상태 6)
  const load = useCallback(async () => {
    const my = ++seq.current;
    setState("loading");
    try {
      const res = await awardClient().getMyAward({ id });
      if (my !== seq.current) return;
      setAward(res.award ?? null);
      setState(res.award ? "ok" : "missing");
    } catch (e) {
      if (my !== seq.current) return;
      const code = (e as { code?: number }).code;
      setState(code === 5 ? "missing" : "error"); // 5 = not_found
    }
  }, [id]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 사람이 바뀌면(user.id) 다시 읽는다
  useEffect(() => {
    if (authLoading) return;
    seq.current++;
    setAward(null);
    setReveal(false);
    if (!user) {
      setState("missing");
      return;
    }
    void load();
  }, [authLoading, user?.id, load]);

  const save = async (fn: () => Promise<unknown>, next: Partial<MyAward>) => {
    // 그리기 전에 두 번 눌러도 한 번만(REV-155 상태 7)
    if (!award || saving.current) return;
    saving.current = true;
    setBusy(true);
    // 누르자마자 바뀐 상태를 보이고(스위치가 굳어 보이지 않게), 실패하면 되돌린다
    const prev = award;
    setAward({ ...award, ...next } as MyAward);
    try {
      await fn();
    } catch {
      setAward(prev);
      toast(t("awards.coupon.saveFail"), "error");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  // 화면을 떠나면 번호를 다시 가린다 — 뒤로 가기 캐시로 돌아와도 열린 채 보이지 않게(REV-155 보안 4)
  useEffect(() => {
    const hide = () => setReveal(false);
    window.addEventListener("pagehide", hide);
    return () => window.removeEventListener("pagehide", hide);
  }, []);

  const copy = async () => {
    if (!award?.couponCode) return;
    try {
      await navigator.clipboard.writeText(award.couponCode);
      toast(t("awards.coupon.copied"));
    } catch {
      setReveal(true);
      toast(t("awards.coupon.copyFail"), "error");
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("awards.coupon.title")}
        back={<BackLink fallbackHref="/awards" testId="award-coupon-back" />}
      />
      <div className="flex flex-col gap-[var(--spacing-lg)] p-[var(--spacing-lg)]" data-testid="award-coupon">
        {state === "loading" ? <div className="h-32" aria-hidden /> : null}
        {state === "missing" ? (
          <div className="flex flex-col gap-[var(--spacing-sm)]" data-testid="award-coupon-missing">
            <p className="text-(--color-ink2)">
              {user ? t("awards.coupon.notFound") : t("awards.signinHint")}
            </p>
            {/* 알림에서 왔는데 세션이 풀렸으면 로그인으로 — REV-155 화면 8 */}
            {!user && !authLoading ? (
              <a
                href="/signin"
                className={`${actionBoxClass("neutral")} min-h-11 px-[var(--spacing-md)]`}
                data-testid="award-coupon-signin"
              >
                {t("awards.signin")}
              </a>
            ) : null}
          </div>
        ) : null}
        {state === "error" ? (
          <div className="flex items-center justify-between gap-[var(--spacing-sm)]">
            <span className="text-(--color-ink2)">{t("awards.loadError")}</span>
            <button
              type="button"
              onClick={() => void load()}
              className={`${actionBoxClass("neutral")} min-h-11 px-[var(--spacing-md)]`}
            >
              {t("awards.retry")}
            </button>
          </div>
        ) : null}
        {state === "ok" && award ? (
          <>
            <div className="flex items-center gap-[var(--spacing-sm)]">
              <Icon name="trophy-outline" size={28} color="var(--color-ink)" />
              <div>
                <div className="text-[length:var(--text-sm)] text-(--color-ink2)">{t("awards.title")}</div>
                <div className="font-bold text-[length:var(--text-lg)]" data-testid="award-coupon-title">
                  {t("awards.myAwardRow", {
                    month: monthLabel(award.month),
                    category: categoryLabel(award.category),
                  })}
                </div>
              </div>
            </div>

            {award.hasCoupon ? (
              <div className="flex flex-col gap-[var(--spacing-sm)]">
                <div>
                  <div className="text-[length:var(--text-sm)] text-(--color-ink2)">
                    {t("awards.coupon.item")}
                  </div>
                  <div className="font-semibold" data-testid="award-coupon-item">
                    {award.couponItem}
                  </div>
                </div>
                <div>
                  <div className="text-[length:var(--text-sm)] text-(--color-ink2)">
                    {t("awards.coupon.code")}
                  </div>
                  {/* 열면 읽어 주고, 단추는 「번호 숨기기」로 남아 포커스가 사라지지 않는다(REV-155 화면 1) */}
                  <div id="award-coupon-code-box" aria-live="polite">
                    {reveal ? (
                      <div
                        className="select-all break-all font-mono font-semibold text-[length:var(--text-lg)]"
                        data-testid="award-coupon-code"
                      >
                        {award.couponCode}
                      </div>
                    ) : (
                      <div className="font-mono text-(--color-ink3)">
                        <span aria-hidden>•••• •••• ••••</span>
                        <span className="sr-only">{t("awards.coupon.masked")}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-[var(--spacing-xs)]">
                  <button
                    type="button"
                    data-testid={reveal ? "award-coupon-hide" : "award-coupon-reveal"}
                    aria-expanded={reveal}
                    aria-controls="award-coupon-code-box"
                    onClick={() => setReveal((v) => !v)}
                    className={`${actionBoxClass("neutral")} min-h-11 flex-1 px-[var(--spacing-md)]`}
                  >
                    {reveal ? t("awards.coupon.hide") : t("awards.coupon.show")}
                  </button>
                  <button
                    type="button"
                    data-testid="award-coupon-copy"
                    onClick={() => void copy()}
                    className={`${actionBoxClass("neutral")} min-h-11 flex-1 gap-[var(--spacing-xs)] px-[var(--spacing-md)]`}
                  >
                    <Icon name="copy-outline" size={18} color="var(--color-ink)" />
                    {t("awards.coupon.copy")}
                  </button>
                </div>
                {award.couponExpires ? (
                  <p className="text-[length:var(--text-sm)] text-(--color-ink2)">
                    {t("awards.coupon.expires", { date: award.couponExpires })}
                  </p>
                ) : null}
                {award.claimedAt ? (
                  <>
                    <p
                      className="text-[length:var(--text-sm)] font-semibold"
                      data-testid="award-coupon-claimed"
                    >
                      {t("awards.coupon.claimedAt", { date: day(award.claimedAt) })}
                    </p>
                    <Button
                      variant="quiet"
                      title={t("awards.coupon.unclaim")}
                      testId="award-coupon-unclaim"
                      disabled={busy}
                      onPress={() =>
                        void save(() => awardClient().markClaimed({ id: award.id, claimed: false }), {
                          claimedAt: undefined,
                        })
                      }
                    />
                  </>
                ) : (
                  <Button
                    title={t("awards.coupon.claim")}
                    testId="award-coupon-claim"
                    disabled={busy}
                    onPress={() =>
                      void save(() => awardClient().markClaimed({ id: award.id, claimed: true }), {
                        claimedAt: {
                          seconds: BigInt(Math.floor(Date.now() / 1000)),
                          nanos: 0,
                        } as MyAward["claimedAt"],
                      })
                    }
                  />
                )}
                <p className="text-[length:var(--text-xs)] text-(--color-ink3)">
                  {t("awards.coupon.deadline")}
                </p>
              </div>
            ) : (
              <p className="text-(--color-ink2)" data-testid="award-coupon-preparing">
                {t("awards.coupon.preparing")}
              </p>
            )}

            <label className="flex min-h-11 items-center justify-between gap-[var(--spacing-sm)] border-(--color-line) border-t pt-[var(--spacing-md)]">
              <span>
                <span className="block font-semibold">{t("awards.coupon.public")}</span>
                <span className="block text-[length:var(--text-xs)] text-(--color-ink2)">
                  {t("awards.coupon.publicHint")}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-checked={award.public}
                data-testid="award-coupon-public"
                className="h-6 w-6 shrink-0 accent-(--color-brand)"
                checked={award.public}
                disabled={busy}
                onChange={(e) => {
                  const on = e.target.checked;
                  void save(() => awardClient().setPublic({ id: award.id, public: on }), { public: on });
                }}
              />
            </label>
          </>
        ) : null}
      </div>
    </div>
  );
}
