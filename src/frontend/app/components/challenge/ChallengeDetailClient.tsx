"use client";
// 그룹 챌린지 상세(SPEC-064 Phase 2 · SRS-118~120) — /challenges/[id].
//
//   모집 중  규칙 · 초대 링크(방장) · 멤버 · 규칙 고치기(방장) · 나가기/해산
//   진행 중  오늘 · 주간 출석표(칸 → 그날 인증 · 이의) · 집계 · 벌칙(이행 체크) · 방장 넘기기 · 나가기
//   끝      결과표(집계) · 벌칙 · 사진 지워지는 날
// 판단은 응답을 받은 뒤에만 한다(받기 전 빈 값을 「멤버 없음」 등으로 그리지 않는다).
import type { Cell, Detail, Member } from "@app/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  addDays,
  challengeClient,
  dayLabel,
  inviteLink,
  lastDayOf,
  MAX_MEMBERS,
  myTodayName,
  proofModeText,
  scheduleText,
} from "@/lib/challengeClient";
import { errorText } from "@/lib/errorText";
import { t } from "@/lib/i18n";
import { navigate } from "@/lib/nav";
import { useAuth } from "../AuthProvider";
import { useToast } from "../Toast";
import { BackLink } from "../ui/BackLink";
import { actionBoxClass } from "../ui/Button";
import { ActionSheet, ConfirmDialog } from "../ui/Dialog";
import { Avatar } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import { ScreenHeader } from "../ui/ScreenHeader";
import { ChallengeForm, draftFromRule, type RuleDraft } from "./ChallengeForm";
import { ruleFromDraft, statusLabel } from "./ChallengesClient";
import { DaySheet, ErrorLine, Legend, memberName, Section, WeekTable } from "./parts";
import { forgetMine } from "./ChallengeEntry";

function KV({ k, v, testId }: { k: string; v: string; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-[var(--spacing-md)]">
      <span className="shrink-0 text-(--color-ink2) text-[length:var(--text-sm)]">{k}</span>
      <span className="min-w-0 text-right text-[length:var(--text-sm)]" data-testid={testId}>
        {v}
      </span>
    </div>
  );
}

export default function ChallengeDetailClient({ id }: { id: string }) {
  const { user, loading: authLoading, restoring } = useAuth();
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<null | "leave" | "rotate" | { kick: Member } | { transfer: Member }>(
    null,
  );
  const [picking, setPicking] = useState(false);
  const [sheet, setSheet] = useState<{ cell: Cell; member: Member } | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const load = useCallback(
    async (w: number | null) => {
      const my = ++seq.current;
      setError(null);
      try {
        const r = await challengeClient().get({ id, week: w ?? 0, weekSet: w !== null });
        if (my !== seq.current) return;
        setD(r.detail ?? null);
      } catch (e) {
        if (my === seq.current) setError(errorText(e));
      }
    },
    [id],
  );

  useEffect(() => {
    if (user) void load(week);
  }, [user, load, week]);

  async function run(fn: () => Promise<unknown>, done?: string) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (done) toast(done);
      await load(week);
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      toast(t("challenge.invite.copied"));
    } catch {
      toast(t("challenge.invite.copyFailed", { link }), "error");
    }
  }

  async function share(link: string, title: string) {
    try {
      await navigator.share({ title, text: t("challenge.invite.shareText", { title }), url: link });
    } catch {
      // 닫음 — 아무것도 하지 않는다
    }
  }

  const header = (title: string) => (
    <ScreenHeader title={title} back={<BackLink fallbackHref="/challenges" testId="challenge-back" />} />
  );

  if (authLoading || restoring)
    return <div className="flex flex-1 flex-col">{header(t("challenge.title"))}</div>;
  if (!user)
    return (
      <div className="flex flex-1 flex-col">
        {header(t("challenge.title"))}
        <div className="flex items-center justify-between gap-[var(--spacing-sm)] p-[var(--spacing-lg)]">
          <span className="text-(--color-ink2)">{t("challenge.signinHint")}</span>
          <a href="/signin" className={`${actionBoxClass("neutral")} min-h-11 px-[var(--spacing-md)]`}>
            {t("awards.signin")}
          </a>
        </div>
      </div>
    );
  if (!d)
    return (
      <div className="flex flex-1 flex-col">
        {header(t("challenge.title"))}
        <div className="p-[var(--spacing-lg)]">
          {error ? (
            <ErrorLine message={error} onRetry={() => void load(week)} />
          ) : (
            <div className="h-40" aria-hidden />
          )}
        </div>
      </div>
    );

  const s = d.summary;
  const rule = s?.rule;
  // [원본] if (!s || !rule) return null;
  // [개선] 머리글 없는 빈 화면이 되지 않게(REV-161 L-8)
  if (!s || !rule)
    return (
      <div className="flex flex-1 flex-col">
        {header("")}
        <div className="p-[var(--spacing-lg)]">
          <ErrorLine message={t("challenge.detail.loadFailed")} onRetry={() => void load(week)} />
        </div>
      </div>
    );
  const status = s.status;
  const isOwner = s.isOwner;
  const active = d.members.filter((m) => !m.left);
  const byId = new Map(d.members.map((m) => [m.userId, m]));
  const weekStart = addDays(rule.startsOn, d.week * 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const link = d.inviteToken ? inviteLink(d.inviteToken) : "";
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const myDebts = d.debts.filter((x) => x.userId === user.id);

  return (
    <div className="flex flex-1 flex-col">
      {header(rule.title)}
      <div
        className="flex flex-col gap-[var(--spacing-xl)] p-[var(--spacing-lg)]"
        data-testid="challenge-detail"
        data-status={status}
      >
        {/* 규칙 */}
        <Section
          title={t("challenge.detail.rule")}
          testId="challenge-rule"
          right={
            <span
              className="rounded-[var(--radius-sm)] border border-(--color-line-strong) px-[6px] text-[length:var(--text-xs)] text-(--color-ink2)"
              data-testid="challenge-status"
            >
              {statusLabel(status)}
            </span>
          }
        >
          <KV
            k={t("challenge.detail.period")}
            v={`${dayLabel(rule.startsOn)} ~ ${dayLabel(lastDayOf(rule))}`}
            testId="challenge-period"
          />
          <KV k={t("challenge.form.schedule")} v={scheduleText(rule)} />
          <KV
            k={t("challenge.form.minSets")}
            v={t("challenge.rule.minSets", { n: rule.minSets })}
            testId="challenge-minsets"
          />
          <KV k={t("challenge.form.proof")} v={proofModeText(rule.proofMode)} />
          <KV
            k={t("challenge.form.pass")}
            v={rule.passPerWeek ? t("challenge.form.passOne") : t("challenge.form.passNone")}
          />
          <KV
            k={t("challenge.form.penalty")}
            v={rule.penaltyText || t("challenge.detail.noPenalty")}
            testId="challenge-penalty"
          />
          <p className="text-(--color-ink3) text-[length:var(--text-xs)]">
            {t("challenge.detail.makeupRule", { n: rule.minSets * 2 })}
          </p>
          {isOwner && status === "recruiting" ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              data-testid="challenge-edit"
              className={`${actionBoxClass("neutral")} min-h-11 self-start gap-[6px] px-[var(--spacing-md)]`}
            >
              <Icon name="create-outline" size={18} color="currentColor" />
              {t("challenge.detail.edit")}
            </button>
          ) : null}
        </Section>

        {/* 모집 중 — 초대 · 멤버 */}
        {status === "recruiting" ? (
          <>
            <p
              className="text-(--color-ink2) text-[length:var(--text-sm)]"
              data-testid="challenge-recruiting-note"
            >
              {t("challenge.detail.recruitingNote", { day: dayLabel(rule.startsOn) })}
            </p>
            {isOwner && link ? (
              <Section title={t("challenge.invite.title")} testId="challenge-invite">
                <p
                  className="break-all rounded-[var(--radius-sm)] border border-(--color-line) px-[var(--spacing-md)] py-[var(--spacing-sm)] text-[length:var(--text-sm)]"
                  data-testid="challenge-invite-link"
                >
                  {link}
                </p>
                <div className="flex flex-wrap gap-[var(--spacing-sm)]">
                  <button
                    type="button"
                    onClick={() => void copy(link)}
                    data-testid="challenge-invite-copy"
                    className={`${actionBoxClass("brand")} min-h-11 gap-[6px] px-[var(--spacing-md)]`}
                  >
                    <Icon name="copy-outline" size={18} color="currentColor" />
                    {t("challenge.invite.copy")}
                  </button>
                  {canShare ? (
                    <button
                      type="button"
                      onClick={() => void share(link, rule.title)}
                      data-testid="challenge-invite-share"
                      className={`${actionBoxClass("neutral")} min-h-11 gap-[6px] px-[var(--spacing-md)]`}
                    >
                      <Icon name="share-social-outline" size={18} color="currentColor" />
                      {t("challenge.invite.share")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setConfirm("rotate")}
                    data-testid="challenge-invite-rotate"
                    className={`${actionBoxClass("neutral")} min-h-11 px-[var(--spacing-md)]`}
                  >
                    {t("challenge.invite.rotate")}
                  </button>
                </div>
              </Section>
            ) : null}
            <Section
              title={t("challenge.detail.members", { n: active.length, max: MAX_MEMBERS })}
              testId="challenge-members"
            >
              <ul className="flex flex-col">
                {active.map((m) => (
                  <li
                    key={m.userId}
                    className="flex min-h-[52px] items-center gap-[var(--spacing-md)] border-(--color-line) border-b px-[var(--spacing-xs)]"
                    data-testid={`challenge-member-${m.userId}`}
                  >
                    <Avatar name={m.displayName} url={m.avatarUrl} size={32} />
                    <span className="min-w-0 flex-1 truncate">{memberName(m)}</span>
                    {m.isOwner ? (
                      <span className="text-(--color-ink2) text-[length:var(--text-xs)]">
                        {t("challenge.detail.owner")}
                      </span>
                    ) : null}
                    {isOwner && !m.isOwner ? (
                      <button
                        type="button"
                        onClick={() => setConfirm({ kick: m })}
                        data-testid={`challenge-kick-${m.userId}`}
                        className={`${actionBoxClass("bad")} min-h-11 px-[var(--spacing-sm)] text-[length:var(--text-sm)]`}
                      >
                        {t("challenge.detail.kick")}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {active.length === 2 ? (
                <p
                  className="text-(--color-ink2) text-[length:var(--text-xs)]"
                  data-testid="challenge-two-note"
                >
                  {t("challenge.detail.twoNote")}
                </p>
              ) : null}
            </Section>
          </>
        ) : null}

        {/* 진행 중·끝 — 출석표 */}
        {status === "active" || status === "ended" ? (
          <Section
            title={t("challenge.detail.week", { n: d.week + 1, total: d.weekCount })}
            testId="challenge-week-section"
            right={
              <div className="flex gap-[4px]">
                <button
                  type="button"
                  aria-label={t("challenge.detail.prevWeek")}
                  disabled={d.week <= 0}
                  onClick={() => setWeek(d.week - 1)}
                  data-testid="challenge-week-prev"
                  className={`${actionBoxClass("neutral")} h-11 w-11`}
                >
                  <Icon name="chevron-back" size={18} color="currentColor" />
                </button>
                <button
                  type="button"
                  aria-label={t("challenge.detail.nextWeek")}
                  disabled={d.week >= d.weekCount - 1}
                  onClick={() => setWeek(d.week + 1)}
                  data-testid="challenge-week-next"
                  className={`${actionBoxClass("neutral")} h-11 w-11`}
                >
                  <Icon name="chevron-forward" size={18} color="currentColor" />
                </button>
              </div>
            }
          >
            {status === "active" && s.myToday ? (
              <p className="font-semibold" data-testid="challenge-my-today">
                {t("challenge.detail.myToday", { state: myTodayName(s.myToday) })}
              </p>
            ) : null}
            <WeekTable
              days={days}
              members={d.members}
              cells={d.cells}
              today={d.today}
              onCell={(cell, member) => setSheet({ cell, member })}
            />
            <Legend />
            {status === "active" && rule.passPerWeek > 0 ? (
              <p
                className="text-(--color-ink2) text-[length:var(--text-sm)]"
                data-testid="challenge-passes-left"
              >
                {t("challenge.detail.passesLeft", { n: d.myPassesLeft })}
              </p>
            ) : null}
          </Section>
        ) : null}

        {/* 집계 */}
        {(status === "active" || status === "ended") && d.tallies.length > 0 ? (
          <Section
            title={status === "ended" ? t("challenge.detail.result") : t("challenge.detail.tally")}
            testId="challenge-tally"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-[length:var(--text-sm)]">
                <thead>
                  <tr className="text-(--color-ink2) text-[length:var(--text-xs)]">
                    <th className="text-left font-medium">{t("challenge.table.member")}</th>
                    <th className="font-medium">{t("challenge.cell.done")}</th>
                    <th className="font-medium">{t("challenge.cell.made_up")}</th>
                    <th className="font-medium">{t("challenge.cell.pass")}</th>
                    <th className="font-medium">{t("challenge.cell.missed")}</th>
                    <th className="font-medium">{t("challenge.table.penalty")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.tallies.map((x) => (
                    <tr
                      key={x.userId}
                      className="border-(--color-line) border-t text-center"
                      data-testid={`challenge-tally-${x.userId}`}
                    >
                      <td className="max-w-0 truncate py-[6px] text-left">
                        {memberName(byId.get(x.userId))}
                      </td>
                      <td>{x.done}</td>
                      <td>{x.madeUp}</td>
                      <td>{x.pass}</td>
                      <td className={x.missed > 0 ? "font-semibold text-(--color-bad)" : ""}>{x.missed}</td>
                      <td>{x.debts > 0 ? `${x.debtsPaid}/${x.debts}` : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        ) : null}

        {/* 벌칙 */}
        {d.debts.length > 0 ? (
          <Section title={t("challenge.detail.debts")} testId="challenge-debts">
            {rule.penaltyText ? (
              <p className="text-(--color-ink2) text-[length:var(--text-sm)]">{rule.penaltyText}</p>
            ) : null}
            <ul className="flex flex-col">
              {d.debts.map((x) => {
                const can = x.userId === user.id || isOwner;
                const key = `${x.userId}-${x.day}`;
                return (
                  <li
                    key={key}
                    className="flex min-h-[52px] items-center gap-[var(--spacing-md)] border-(--color-line) border-b px-[var(--spacing-xs)]"
                    data-testid={`challenge-debt-${key}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{memberName(byId.get(x.userId))}</span>
                      <span className="block text-(--color-ink2) text-[length:var(--text-xs)]">
                        {dayLabel(x.day)}
                      </span>
                    </span>
                    {can ? (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={x.paid}
                        aria-label={`${t("challenge.debt.markPaid")} · ${dayLabel(x.day)}`}
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            challengeClient().markDebtPaid({
                              id,
                              userId: x.userId,
                              day: x.day,
                              paid: !x.paid,
                            }),
                          )
                        }
                        data-testid={`challenge-debt-toggle-${key}`}
                        className={`${actionBoxClass(x.paid ? "brand" : "neutral")} min-h-11 gap-[6px] px-[var(--spacing-md)]`}
                      >
                        <Icon
                          name={x.paid ? "checkmark-circle" : "ellipse-outline"}
                          size={18}
                          color="currentColor"
                        />
                        {x.paid ? t("challenge.debt.paid") : t("challenge.debt.markPaid")}
                      </button>
                    ) : (
                      <span className="text-(--color-ink2) text-[length:var(--text-sm)]">
                        {x.paid ? t("challenge.debt.paid") : t("challenge.debt.unpaid")}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {myDebts.length > 0 ? (
              <p className="text-(--color-ink3) text-[length:var(--text-xs)]">{t("challenge.debt.note")}</p>
            ) : null}
          </Section>
        ) : null}

        {status === "ended" || status === "cancelled" ? (
          d.photosPurgeOn ? (
            <p className="text-(--color-ink2) text-[length:var(--text-sm)]" data-testid="challenge-purge-on">
              {t("challenge.detail.purgeOn", { day: dayLabel(d.photosPurgeOn) })}
            </p>
          ) : null
        ) : null}

        {error ? <ErrorLine message={error} onRetry={() => void load(week)} /> : null}

        {/* 방장 넘기기 · 나가기 */}
        {status === "recruiting" || status === "active" ? (
          <div className="flex flex-wrap gap-[var(--spacing-sm)] border-(--color-line) border-t pt-[var(--spacing-lg)]">
            {isOwner && status === "active" && active.length > 1 ? (
              <button
                type="button"
                onClick={() => setPicking(true)}
                data-testid="challenge-transfer"
                className={`${actionBoxClass("neutral")} min-h-11 px-[var(--spacing-md)]`}
              >
                {t("challenge.detail.transfer")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setConfirm("leave")}
              disabled={isOwner && status === "active" && active.length > 1}
              data-testid="challenge-leave"
              className={`${actionBoxClass("bad")} min-h-11 px-[var(--spacing-md)]`}
            >
              {isOwner && status === "recruiting"
                ? t("challenge.detail.disband")
                : t("challenge.detail.leave")}
            </button>
            {isOwner && status === "active" && active.length > 1 ? (
              <p className="w-full text-(--color-ink3) text-[length:var(--text-xs)]">
                {t("challenge.detail.transferFirst")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {editing ? (
        <ChallengeForm
          editing
          initial={draftFromRule(rule)}
          onClose={() => setEditing(false)}
          onSubmit={async (draft: RuleDraft) => {
            const r = await challengeClient().update({ id, rule: ruleFromDraft(draft) });
            setEditing(false);
            if (r.detail) setD(r.detail);
            toast(t("challenge.detail.saved"));
          }}
        />
      ) : null}
      {sheet ? (
        <DaySheet
          challengeId={id}
          cell={sheet.cell}
          member={sheet.member}
          myId={user.id}
          recordOnly={d.summary?.rule?.proofMode === "record"}
          onClose={() => setSheet(null)}
          onChanged={() => void load(week)}
        />
      ) : null}
      {picking ? (
        <ActionSheet
          title={t("challenge.detail.transferTitle")}
          testId="challenge-transfer-sheet"
          options={active
            .filter((m) => !m.isOwner)
            .map((m) => ({
              label: memberName(m),
              testId: `challenge-transfer-to-${m.userId}`,
              onPress: () => setConfirm({ transfer: m }),
            }))}
          onClose={() => setPicking(false)}
        />
      ) : null}
      {confirm === "leave" ? (
        <ConfirmDialog
          title={
            isOwner && status === "recruiting"
              ? t("challenge.detail.disbandTitle")
              : t("challenge.detail.leaveTitle")
          }
          message={
            isOwner && status === "recruiting"
              ? t("challenge.detail.disbandMessage")
              : status === "active"
                ? t("challenge.detail.leaveActiveMessage")
                : undefined
          }
          confirmLabel={
            isOwner && status === "recruiting" ? t("challenge.detail.disband") : t("challenge.detail.leave")
          }
          destructive
          testId="challenge-leave-confirm"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void (async () => {
              try {
                await challengeClient().leave({ id });
                forgetMine();
                navigate("/challenges", { replace: true });
              } catch (e) {
                toast(errorText(e), "error");
              }
            })();
          }}
        />
      ) : confirm === "rotate" ? (
        <ConfirmDialog
          title={t("challenge.invite.rotateTitle")}
          message={t("challenge.invite.rotateMessage")}
          confirmLabel={t("challenge.invite.rotate")}
          testId="challenge-rotate-confirm"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void run(() => challengeClient().rotateInvite({ id }), t("challenge.invite.rotated"));
          }}
        />
      ) : confirm && "kick" in confirm ? (
        <ConfirmDialog
          title={t("challenge.detail.kickTitle", { name: memberName(confirm.kick) })}
          confirmLabel={t("challenge.detail.kick")}
          destructive
          testId="challenge-kick-confirm"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const m = confirm.kick;
            setConfirm(null);
            void run(() => challengeClient().kick({ id, userId: m.userId }));
          }}
        />
      ) : confirm && "transfer" in confirm ? (
        <ConfirmDialog
          title={t("challenge.detail.transferConfirm", { name: memberName(confirm.transfer) })}
          confirmLabel={t("challenge.detail.transfer")}
          testId="challenge-transfer-confirm"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const m = confirm.transfer;
            setConfirm(null);
            void run(
              () => challengeClient().transferOwner({ id, userId: m.userId }),
              t("challenge.detail.transferred"),
            );
          }}
        />
      ) : null}
    </div>
  );
}
