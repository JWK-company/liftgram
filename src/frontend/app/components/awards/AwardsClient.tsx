"use client";
// 이달의 리프터(SPEC-063 · SRS-117) — /awards.
//
// 순서: 내 이번 달(로그인만) → 수상자(발표된 달이 있으면 실제 · 하나도 없으면 「예시」) → 내 상 → 규칙 → 지난 달.
// 예시·규칙은 앱 코드의 고정 글이라 서버가 없어도 그린다. 판단(예시냐 실제냐)은 목록을 다 받은 뒤에만 한다 —
// 받기 전의 빈 배열을 「발표 없음」으로 읽으면 실제 수상자가 있어도 예시가 잠깐 비친다(로드 전 []≠0).
import type { AwardMonth, GetMonthResponse, MyAward } from "@app/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { t, type TransKey } from "@/lib/i18n";
import {
  awardClient,
  kstMonth,
  kstMonthBounds,
  monthLabel,
  nextMonth,
  prevMonth,
  FIRST_MONTH,
  STEADY_GOAL,
} from "@/lib/awardClient";
import { useAuth } from "../AuthProvider";
import { BackLink } from "../ui/BackLink";
import { actionBoxClass } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { ScreenHeader } from "../ui/ScreenHeader";
import { categoryLabel, ExampleSection, WinnerRow } from "./parts";

const RULES: TransKey[] = [
  "awards.rule.steady",
  "awards.rule.late",
  "awards.rule.popular",
  "awards.rule.pick",
  "awards.rule.seed",
  "awards.rule.eligibility",
  "awards.rule.period",
  "awards.rule.prize",
  "awards.rule.coupon",
  "awards.rule.public",
  "awards.rule.fraud",
  "awards.rule.host",
  "awards.rule.platform",
];

const REASONS = new Set(["new", "email", "age", "role", "excluded"]);

/** 이 기기의 이번 달 운동한 날(서버와 같은 기준) — 실패하면 null(그 줄을 안 보인다) */
async function localDays(month: string): Promise<number | null> {
  try {
    const [from, to] = kstMonthBounds(month);
    const repo = await import("@app/core/data/workoutRepository");
    return await repo.countWorkoutDaysInRange(from, to);
  } catch {
    return null;
  }
}

function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="flex flex-col gap-[var(--spacing-sm)]" data-testid={testId}>
      <h2 className="font-bold text-[length:var(--text-md)]">{title}</h2>
      {children}
    </section>
  );
}

export default function AwardsClient() {
  const { user, loading: authLoading } = useAuth();
  // 달은 서버가 정한 달을 따른다 — 기기 시계가 어긋나거나 자정을 넘겨도 제목·기기 수·서버 수가 같은 달(REV-155 상태 2)
  const [month, setMonth] = useState(() => kstMonth());
  const [view, setView] = useState<GetMonthResponse | null>(null);
  const [months, setMonths] = useState<AwardMonth[] | null>(null);
  const [mine, setMine] = useState<MyAward[] | null>(null);
  const [local, setLocal] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [viewFailed, setViewFailed] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setError(false);
    setViewFailed(false);
    const c = awardClient();
    // 비로그인은 내 현황을 부르지 않는다 — 지난 수상자와 이번 달 씨앗 지문만(REV-153 화면 H3)
    // [원본] Promise.all — 하나만 실패해도 수상자 목록까지 오류로 가렸다
    // [개선] 구역마다 따로(REV-155 상태 5) · 늦게 온 옛 응답(계정 바뀜)은 버린다(상태 4)
    const [ms, v, mineRes] = await Promise.allSettled([
      c.listMonths({ limit: 12 }),
      c.getMonth({}),
      user ? c.listMyAwards({}) : Promise.resolve(null),
    ]);
    if (my !== seq.current) return;
    if (ms.status === "fulfilled") setMonths(ms.value.months);
    else setError(true);
    if (v.status === "fulfilled") {
      setView(v.value);
      if (v.value.month && /^\d{4}-\d{2}$/.test(v.value.month)) setMonth(v.value.month);
    } else setViewFailed(true);
    setMine(mineRes.status === "fulfilled" && mineRes.value ? mineRes.value.awards : []);
  }, [user]);

  // 계정이 바뀌면 앞 계정의 값을 먼저 비운다
  // biome-ignore lint/correctness/useExhaustiveDependencies: user id 가 바뀔 때만 비운다
  useEffect(() => {
    setView(null);
    setMine(null);
    setLocal(null);
  }, [user?.id]);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    void localDays(month).then((n) => {
      if (alive) setLocal(n);
    });
    return () => {
      alive = false;
    };
  }, [user, month]);

  const goal = view?.steadyThreshold || STEADY_GOAL;
  const latest = months && months.length > 0 ? months[0] : null;
  const last = prevMonth(month);
  // 지난 달이 아직 발표 전이면(다음 달 1~2일 · 또는 운영진이 아직) 「준비 중」
  const preparingLast = months !== null && latest !== null && latest.month !== last && last >= FIRST_MONTH;

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("awards.titleMonth", { month: monthLabel(month) })}
        back={<BackLink fallbackHref="/feed" testId="awards-back" />}
      />
      <div
        className="flex flex-col gap-[var(--spacing-xl)] p-[var(--spacing-lg)]"
        data-testid="awards-screen"
      >
        {/* 내 이번 달 */}
        {authLoading ? (
          <div className="h-40" aria-hidden />
        ) : user ? (
          <Section title={t("awards.myStatus")} testId="awards-my">
            {view ? (
              <div className="flex flex-col gap-[var(--spacing-sm)]">
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-(--color-ink2)">{t("awards.daysLabel")}</span>
                    <span className="font-semibold" data-testid="awards-my-days">
                      {t("awards.daysValue", { n: view.myDays, goal })}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={t("awards.daysLabel")}
                    aria-valuemin={0}
                    aria-valuemax={goal}
                    aria-valuenow={Math.min(view.myDays, goal)}
                    className="mt-[var(--spacing-xs)] h-2 overflow-hidden rounded-[var(--radius-sm)] bg-(--color-surface-alt)"
                  >
                    <div
                      className="h-full bg-(--color-brand)"
                      style={{ width: `${Math.min(100, (view.myDays / goal) * 100)}%` }}
                    />
                  </div>
                  {local !== null && local > view.myDays ? (
                    <p
                      className="mt-[var(--spacing-xs)] text-[length:var(--text-xs)] text-(--color-ink2)"
                      data-testid="awards-sync-note"
                    >
                      {t("awards.syncNote", { server: view.myDays, local })}
                    </p>
                  ) : (
                    <p className="mt-[var(--spacing-xs)] text-[length:var(--text-xs)] text-(--color-ink3)">
                      {t("awards.syncBasis")}
                    </p>
                  )}
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-(--color-ink2)">{t("awards.likesLabel")}</span>
                  <span className="font-semibold" data-testid="awards-my-likes">
                    {t("awards.likesValue", { n: view.myLikes })}
                  </span>
                </div>
                {view.myEligibility && !view.myEligibility.eligible ? (
                  <ul className="flex flex-col gap-[var(--spacing-xs)]" data-testid="awards-my-reasons">
                    {/* 모르는 이유 코드뿐이면 빈 목록 대신 일반 문구(REV-155 화면 10) */}
                    {(view.myEligibility.reasons.some((r) => REASONS.has(r))
                      ? view.myEligibility.reasons.filter((r) => REASONS.has(r))
                      : ["generic"]
                    ).map((r) => (
                      <li
                        key={r}
                        className="flex gap-[var(--spacing-xs)] text-[length:var(--text-sm)] text-(--color-ink2)"
                      >
                        <Icon name="information-circle-outline" size={16} color="var(--color-ink2)" />
                        {t(`awards.eligibility.${r}` as TransKey)}
                      </li>
                    ))}
                  </ul>
                ) : view.myDays >= goal ? (
                  <p className="text-[length:var(--text-sm)] font-semibold" data-testid="awards-my-reached">
                    {t("awards.reachedSteady")}
                  </p>
                ) : null}
              </div>
            ) : viewFailed || error ? null : (
              <div className="h-40" aria-hidden />
            )}
          </Section>
        ) : (
          <div
            className="flex items-center justify-between gap-[var(--spacing-sm)]"
            data-testid="awards-signin"
          >
            <span className="text-(--color-ink2)">{t("awards.signinHint")}</span>
            <a href="/signin" className={`${actionBoxClass("neutral")} min-h-11 px-[var(--spacing-md)]`}>
              {t("awards.signin")}
            </a>
          </div>
        )}

        {/* 수상자 */}
        {error ? (
          <div
            className="flex items-center justify-between gap-[var(--spacing-sm)]"
            data-testid="awards-error"
          >
            <span className="text-(--color-ink2)">{t("awards.loadError")}</span>
            <button
              type="button"
              onClick={() => void load()}
              className={`${actionBoxClass("neutral")} min-h-11 px-[var(--spacing-md)]`}
            >
              {t("awards.retry")}
            </button>
          </div>
        ) : months === null ? (
          <div className="h-24" aria-hidden data-testid="awards-loading" />
        ) : latest ? (
          <Section
            title={t("awards.winnersTitle", { month: monthLabel(latest.month) })}
            testId="awards-winners"
          >
            {preparingLast ? (
              <p className="text-[length:var(--text-sm)] text-(--color-ink2)">
                {t("awards.preparing", { month: monthLabel(last) })}
              </p>
            ) : null}
            <div className="flex flex-col divide-y divide-(--color-line)">
              {latest.winners.map((w) => (
                <WinnerRow key={w.id} w={w} />
              ))}
            </div>
            {latest.seed ? (
              <p className="break-all text-[length:var(--text-xs)] text-(--color-ink3)">
                {t("awards.seedRevealed", { seed: latest.seed })}
              </p>
            ) : null}
          </Section>
        ) : (
          <Section title={t("awards.title")} testId="awards-none">
            <p
              className="text-[length:var(--text-sm)] text-(--color-ink2)"
              data-testid="awards-first-announce"
            >
              {/* [원본] firstAnnounce(nextMonth(month)) — 12월에 「1월」로 틀렸다(REV-155 상태 1) */}
              {last >= FIRST_MONTH
                ? t("awards.preparing", { month: monthLabel(last) })
                : t("awards.firstAnnounce", { month: monthLabel(nextMonth(FIRST_MONTH)) })}
            </p>
            <ExampleSection goal={goal} />
          </Section>
        )}

        {/* 내 상 */}
        {mine && mine.length > 0 ? (
          <Section title={t("awards.myAwards")} testId="awards-mine">
            <div className="flex flex-col divide-y divide-(--color-line)">
              {mine.map((a) => (
                <a
                  key={a.id}
                  href={`/awards/${encodeURIComponent(a.id)}`}
                  className="flex min-h-11 items-center gap-[var(--spacing-sm)] py-[var(--spacing-sm)]"
                >
                  <Icon name="gift-outline" size={20} color="var(--color-ink2)" />
                  <span className="min-w-0 flex-1 truncate">
                    {t("awards.myAwardRow", {
                      month: monthLabel(a.month),
                      category: categoryLabel(a.category),
                    })}
                  </span>
                  <span className="shrink-0 text-[length:var(--text-sm)] text-(--color-ink2)">
                    {a.claimedAt
                      ? t("awards.couponClaimed")
                      : a.hasCoupon
                        ? t("awards.couponReady")
                        : t("awards.couponPreparing")}
                  </span>
                  <Icon name="chevron-forward" size={18} color="var(--color-ink3)" />
                </a>
              ))}
            </div>
          </Section>
        ) : null}

        {/* 규칙 — 접어 둔다 */}
        <details className="group" data-testid="awards-rules">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-bold text-[length:var(--text-md)] focus-visible:outline-2 focus-visible:outline-(--color-brand) [&::-webkit-details-marker]:hidden">
            {t("awards.rulesTitle")}
            <span className="transition-transform group-open:rotate-180">
              <Icon name="chevron-down" size={18} color="var(--color-ink2)" />
            </span>
          </summary>
          <ul className="mt-[var(--spacing-sm)] flex list-disc flex-col gap-[var(--spacing-xs)] pl-[var(--spacing-lg)] text-[length:var(--text-sm)] text-(--color-ink2)">
            {RULES.map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ul>
          {view?.seedHash && view.month === month ? (
            <p
              className="mt-[var(--spacing-sm)] break-all text-[length:var(--text-xs)] text-(--color-ink3)"
              data-testid="awards-seed-hash"
            >
              {t("awards.seedHash", { hash: view.seedHash })}
            </p>
          ) : null}
        </details>

        {/* 지난 달 — 가장 최근 발표 달은 위에 있으니 그 앞 달들만 */}
        {months && months.length > 1 ? (
          <Section title={t("awards.pastTitle")} testId="awards-past">
            {months.slice(1).map((m) => (
              <div key={m.month} className="flex flex-col">
                <h3 className="font-semibold text-[length:var(--text-sm)] text-(--color-ink2)">
                  {t("awards.winnersTitle", { month: monthLabel(m.month) })}
                </h3>
                <div className="flex flex-col divide-y divide-(--color-line)">
                  {m.winners.map((w) => (
                    <WinnerRow key={w.id} w={w} />
                  ))}
                </div>
              </div>
            ))}
          </Section>
        ) : null}
      </div>
    </div>
  );
}
