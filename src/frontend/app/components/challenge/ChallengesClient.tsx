"use client";
// 그룹 챌린지 목록(SPEC-064 Phase 2 · SRS-118) — /challenges.
//
// 진행 중 → 모집 중 → 끝난 것 순. 판단은 목록을 다 받은 뒤에 한다(받기 전 [] 를 「없음」으로 그리지 않는다).
import type { Summary } from "@app/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { challengeClient, dayLabel, myTodayName, ruleLine } from "@/lib/challengeClient";
import { errorText } from "@/lib/errorText";
import { t } from "@/lib/i18n";
import { navigate } from "@/lib/nav";
import { useAuth } from "../AuthProvider";
import { BackLink } from "../ui/BackLink";
import { actionBoxClass } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { ErrorLine } from "./parts";
import { ScreenHeader } from "../ui/ScreenHeader";
import { ChallengeForm, defaultDraft, type RuleDraft } from "./ChallengeForm";
import { forgetMine } from "./ChallengeEntry";

export function statusLabel(s: string): string {
  switch (s) {
    case "recruiting":
      return t("challenge.status.recruiting");
    case "active":
      return t("challenge.status.active");
    case "ended":
      return t("challenge.status.ended");
    case "cancelled":
      return t("challenge.status.cancelled");
    default:
      return s;
  }
}

/** 시트의 값 → 계약의 Rule 초기값(Connect 클라이언트는 평범한 객체를 받는다) */
export function ruleFromDraft(d: RuleDraft) {
  return { ...d };
}

const ORDER: Record<string, number> = { active: 0, recruiting: 1, ended: 2, cancelled: 3 };

function Row({ s }: { s: Summary }) {
  const rule = s.rule;
  const sub =
    s.status === "active" && s.myToday
      ? t("challenge.list.today", { state: myTodayName(s.myToday) })
      : s.status === "recruiting" && rule
        ? t("challenge.list.startsOn", { day: dayLabel(rule.startsOn), n: s.memberCount })
        : s.status === "ended" || s.status === "cancelled"
          ? statusLabel(s.status)
          : "";
  return (
    <a
      href={`/challenges/${encodeURIComponent(s.id)}`}
      data-testid={`challenge-row-${s.id}`}
      className="flex min-h-[64px] items-center gap-[var(--spacing-md)] border-(--color-line) border-b px-[var(--spacing-xs)] py-[var(--spacing-md)] active:bg-(--color-surface-alt)"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-[var(--spacing-xs)]">
          <span className="truncate font-semibold text-[length:var(--text-md)]">{rule?.title}</span>
          <span
            className="shrink-0 rounded-[var(--radius-sm)] border border-(--color-line-strong) px-[6px] text-[length:var(--text-xs)] text-(--color-ink2)"
            data-testid="challenge-row-status"
          >
            {statusLabel(s.status)}
          </span>
        </span>
        {rule ? (
          <span className="truncate text-(--color-ink2) text-[length:var(--text-sm)]">{ruleLine(rule)}</span>
        ) : null}
        {sub ? <span className="text-(--color-ink2) text-[length:var(--text-sm)]">{sub}</span> : null}
      </span>
      <Icon name="chevron-forward" size={18} color="var(--color-ink3)" />
    </a>
  );
}

export default function ChallengesClient() {
  const { user, loading: authLoading, restoring } = useAuth();
  const [items, setItems] = useState<Summary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const my = ++seq.current;
    setError(null);
    try {
      const r = await challengeClient().listMine({});
      if (my !== seq.current) return;
      setItems([...r.items].sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9)));
    } catch (e) {
      if (my === seq.current) setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  async function submit(d: RuleDraft) {
    const r = await challengeClient().create({ rule: ruleFromDraft(d) });
    forgetMine();
    const id = r.detail?.summary?.id;
    setCreating(false);
    if (id) navigate(`/challenges/${encodeURIComponent(id)}`);
    else void load();
  }

  const openCount = (items ?? []).filter((s) => s.status === "active" || s.status === "recruiting").length;

  return (
    <div className="flex flex-1 flex-col">
      <ScreenHeader
        title={t("challenge.title")}
        back={<BackLink fallbackHref="/" testId="challenges-back" />}
      />
      <div
        className="flex flex-col gap-[var(--spacing-lg)] p-[var(--spacing-lg)]"
        data-testid="challenges-screen"
      >
        <p className="text-(--color-ink2) text-[length:var(--text-sm)]">{t("challenge.intro")}</p>
        {authLoading || restoring ? (
          <div className="h-40" aria-hidden />
        ) : !user ? (
          <div
            className="flex items-center justify-between gap-[var(--spacing-sm)]"
            data-testid="challenges-signin"
          >
            <span className="text-(--color-ink2)">{t("challenge.signinHint")}</span>
            <a href="/signin" className={`${actionBoxClass("neutral")} min-h-11 px-[var(--spacing-md)]`}>
              {t("awards.signin")}
            </a>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setCreating(true)}
              disabled={items !== null && openCount >= 5}
              data-testid="challenges-new"
              className={`${actionBoxClass("brandFill")} min-h-12 gap-[6px] px-[var(--spacing-lg)]`}
            >
              <Icon name="add" size={20} color="currentColor" />
              {t("challenge.new")}
            </button>
            {items !== null && openCount >= 5 ? (
              <p className="text-(--color-ink2) text-[length:var(--text-sm)]" data-testid="challenges-limit">
                {t("challenge.limit")}
              </p>
            ) : null}
            {error ? (
              <ErrorLine message={error} onRetry={() => void load()} />
            ) : items === null ? (
              <div className="h-40" aria-hidden />
            ) : items.length === 0 ? (
              <p
                className="py-[var(--spacing-xl)] text-center text-(--color-ink2)"
                data-testid="challenges-empty"
              >
                {t("challenge.empty")}
              </p>
            ) : (
              <div data-testid="challenges-list">
                {items.map((s) => (
                  <Row key={s.id} s={s} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
      {creating ? (
        <ChallengeForm initial={defaultDraft()} onClose={() => setCreating(false)} onSubmit={submit} />
      ) : null}
    </div>
  );
}
