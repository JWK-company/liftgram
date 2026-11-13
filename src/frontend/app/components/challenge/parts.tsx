"use client";
// 그룹 챌린지 화면 조각(SPEC-064) — 오류 줄 · 주간 출석표 · 그날 인증 시트(사진 blob · 이의).
import type { Cell, Member, ProofInfo } from "@app/contracts";
import { timestampDate } from "@bufbuild/protobuf/wkt";
import { useCallback, useEffect, useState } from "react";
import {
  cellName,
  cellSymbol,
  challengeClient,
  dayLabel,
  fetchProofPhoto,
  promptText,
  weekdayName,
  weekday0Mon,
} from "@/lib/challengeClient";
import { errorText } from "@/lib/errorText";
import { lang, t } from "@/lib/i18n";
import { useToast } from "../Toast";
import { actionBoxClass } from "../ui/Button";
import { SheetShell } from "../ui/Dialog";
import { Avatar } from "../ui/Avatar";
import { AppText } from "../ui/primitives";

export function ErrorLine({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      className="flex items-center justify-between gap-[var(--spacing-sm)]"
      role="alert"
      data-testid="challenge-error"
    >
      <span className="text-(--color-bad) text-[length:var(--text-sm)]">{message}</span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className={`${actionBoxClass("neutral")} min-h-11 px-[var(--spacing-md)]`}
        >
          {t("common.retry")}
        </button>
      ) : null}
    </div>
  );
}

export function Section({
  title,
  children,
  testId,
  right,
}: {
  title: string;
  children: React.ReactNode;
  testId?: string;
  right?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-[var(--spacing-sm)]" data-testid={testId}>
      <div className="flex items-center justify-between gap-[var(--spacing-sm)]">
        <h2 className="font-bold text-[length:var(--text-md)]">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** 칸 글자색 — 기호가 뜻을 싣고 색은 거든다(빠짐 = 위험색 · 완료 = 진한 글자) */
function cellTone(result: string): string {
  switch (result) {
    case "missed":
    case "missed_open":
      return "text-(--color-bad) font-bold";
    case "done":
    case "made_up":
    case "pass":
      return "text-(--color-ink) font-bold";
    default:
      return "text-(--color-ink3)";
  }
}

export function memberName(m: Member | undefined): string {
  return m?.displayName || t("discover.unnamed");
}

/**
 * 주간 출석표 — 줄 = 멤버, 칸 = 그 주 7일. 칸을 누르면 그날 인증 시트.
 * 칸은 기호 + 화면 읽기 이름(「민수 · 11월 14일 · 완료」) — 색만으로 뜻을 싣지 않는다.
 */
export function WeekTable({
  days,
  members,
  cells,
  today,
  onCell,
}: {
  days: string[];
  members: Member[];
  cells: Cell[];
  today: string;
  onCell: (c: Cell, m: Member) => void;
}) {
  const byKey = new Map(cells.map((c) => [`${c.userId}|${c.day}`, c]));
  return (
    <div className="overflow-x-auto" data-testid="challenge-week">
      <table className="w-full border-separate border-spacing-[3px] text-center">
        <thead>
          <tr>
            <th className="w-[30%] text-left text-[length:var(--text-xs)] text-(--color-ink2) font-medium">
              {t("challenge.table.member")}
            </th>
            {days.map((d) => (
              <th
                key={d}
                scope="col"
                className={`text-[length:var(--text-xs)] font-medium ${d === today ? "text-(--color-brand)" : "text-(--color-ink2)"}`}
              >
                <span className="block">{weekdayName(weekday0Mon(d))}</span>
                <span className={`block ${d === today ? "font-bold underline" : ""}`}>
                  {Number(d.slice(8))}
                </span>
                {d === today ? <span className="sr-only">{t("challenge.cell.today")}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.userId} data-testid={`challenge-week-row-${m.userId}`}>
              <th scope="row" className="max-w-0 text-left font-normal">
                <span className="flex min-w-0 items-center gap-[4px]">
                  <Avatar name={m.displayName} url={m.avatarUrl} size={22} />
                  <span
                    className={`truncate text-[length:var(--text-sm)] ${m.left ? "text-(--color-ink3) line-through" : ""}`}
                  >
                    {memberName(m)}
                  </span>
                </span>
              </th>
              {days.map((d) => {
                const c = byKey.get(`${m.userId}|${d}`);
                const result = c?.result ?? "";
                // [원본] const label = `${memberName(m)} · ${dayLabel(d)} · ${cellName(result)}${c?.suspect ? ` · ${t("challenge.proof.suspect")}` : ""}`;
                // [개선] 나간 사람의 빈 칸은 「나감」, 오늘 칸은 상태와 함께 「오늘」(REV-161 L-6·L-7)
                const state = result === "" && m.left ? t("challenge.cell.left") : cellName(result);
                const todayMark = d === today && result !== "today" ? ` · ${t("challenge.cell.today")}` : "";
                const label = `${memberName(m)} · ${dayLabel(d)} · ${state}${todayMark}${c?.suspect ? ` · ${t("challenge.proof.suspect")}` : ""}`;
                const tappable = !!c && result !== "" && result !== "upcoming" && result !== "rest";
                return (
                  <td key={d} className="p-0">
                    {tappable && c ? (
                      <button
                        type="button"
                        aria-label={label}
                        data-affordance="cell"
                        data-result={result}
                        data-testid={`challenge-cell-${m.userId}-${d}`}
                        onClick={() => onCell(c, m)}
                        className={`relative flex h-10 w-full min-w-8 items-center justify-center rounded-[var(--radius-sm)] border text-[length:var(--text-md)] ${
                          d === today ? "border-(--color-brand)" : "border-(--color-line-strong)"
                        } ${cellTone(result)}`}
                      >
                        {cellSymbol(result)}
                        {c.suspect ? (
                          <span
                            aria-hidden
                            className="absolute top-[1px] right-[3px] text-[10px] text-(--color-bad)"
                          >
                            ?
                          </span>
                        ) : null}
                      </button>
                    ) : (
                      <span
                        role="img"
                        aria-label={label}
                        data-result={result}
                        data-testid={`challenge-cell-${m.userId}-${d}`}
                        className={`flex h-10 w-full min-w-8 items-center justify-center text-[length:var(--text-md)] ${cellTone(result)}`}
                      >
                        {result === "" ? "" : cellSymbol(result)}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Legend() {
  const items = ["done", "made_up", "pass", "missed_open", "missed", "rest", "pending"];
  return (
    <ul className="flex flex-wrap gap-x-[var(--spacing-md)] gap-y-[2px]" data-testid="challenge-legend">
      {items.map((r) => (
        <li key={r} className="flex items-center gap-[4px] text-[length:var(--text-xs)] text-(--color-ink2)">
          <span aria-hidden className={`inline-block w-4 text-center ${cellTone(r)}`}>
            {cellSymbol(r)}
          </span>
          {cellName(r)}
        </li>
      ))}
    </ul>
  );
}

function timeText(p: ProofInfo): string {
  if (!p.capturedAt) return "";
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(timestampDate(p.capturedAt));
}

/** 인증 사진 한 장 — Bearer fetch → blob 주소(공개 주소로 열리지 않는다 · SRS-121) */
export function ProofPhoto({ proofId }: { proofId: string }) {
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const ac = new AbortController();
    let url: string | null = null;
    void fetchProofPhoto(proofId, ac.signal).then((u) => {
      if (ac.signal.aborted) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      url = u;
      setSrc(u);
    });
    return () => {
      ac.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [proofId]);
  if (src === undefined)
    return (
      <div className="aspect-[3/4] w-full rounded-[var(--radius-sm)] bg-(--color-surface-alt)" aria-hidden />
    );
  if (src === null)
    return (
      <div
        className="flex aspect-[3/4] w-full items-center justify-center rounded-[var(--radius-sm)] bg-(--color-surface-alt) text-(--color-ink2) text-[length:var(--text-sm)]"
        data-testid="proof-photo-gone"
      >
        {t("challenge.proof.photoGone")}
      </div>
    );
  return (
    // biome-ignore lint/performance/noImgElement: blob 주소라 next/image 대상이 아니다
    <img
      src={src}
      alt={t("challenge.proof.photoAlt")}
      className="w-full rounded-[var(--radius-sm)] object-contain"
      data-testid="proof-photo"
    />
  );
}

/** 그날 인증 시트 — 그 사람·그날의 인증들 · 이의(확정 전 · 본인 아님) */
export function DaySheet({
  challengeId,
  cell,
  member,
  myId,
  recordOnly = false,
  onClose,
  onChanged,
}: {
  challengeId: string;
  cell: Cell;
  member: Member;
  myId: string;
  /** 기록만 인정하는 챌린지 — 사진이 없는 것이 정상(REV-161 L-11) */
  recordOnly?: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<ProofInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await challengeClient().listProofs({ id: challengeId, day: cell.day, userId: cell.userId });
      setItems(r.items);
    } catch (e) {
      setError(errorText(e));
    }
  }, [challengeId, cell.day, cell.userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function flag(p: ProofInfo) {
    if (busy) return;
    setBusy(p.id);
    try {
      const r = await challengeClient().flag({ proofId: p.id, on: !p.flaggedByMe });
      const next = r.proof;
      if (next) setItems((xs) => (xs ?? []).map((x) => (x.id === p.id ? next : x)));
      toast(p.flaggedByMe ? t("challenge.proof.unflagged") : t("challenge.proof.flagged"));
      onChanged();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <SheetShell
      title={`${memberName(member)} · ${dayLabel(cell.day)}`}
      onClose={onClose}
      testId="challenge-day-sheet"
    >
      <AppText
        variant="body"
        color="textMuted"
        className="mt-[var(--spacing-xs)] block"
        data-testid="day-sheet-result"
      >
        {cellName(cell.result)}
        {cell.final ? ` · ${t("challenge.cell.final")}` : ""}
      </AppText>
      <div className="mt-[var(--spacing-md)] flex max-h-[60vh] flex-col gap-[var(--spacing-lg)] overflow-y-auto">
        {error ? (
          <ErrorLine message={error} onRetry={() => void load()} />
        ) : items === null ? (
          <div className="h-24" aria-hidden />
        ) : items.length === 0 ? (
          <AppText variant="body" color="textMuted" data-testid="day-sheet-empty">
            {recordOnly ? t("challenge.proof.recordOnly") : t("challenge.proof.none")}
          </AppText>
        ) : (
          items.map((p) => (
            <div key={p.id} className="flex flex-col gap-[var(--spacing-xs)]" data-testid={`proof-${p.id}`}>
              <ProofPhoto proofId={p.id} />
              <AppText variant="body" className="block">
                {promptText(p.promptCode)}
              </AppText>
              <AppText variant="caption" color="textMuted" className="block">
                {[
                  timeText(p),
                  p.web ? t("challenge.proof.web") : "",
                  p.status === "suspect_dup" ? t("challenge.proof.suspect") : "",
                  p.status === "invalid" ? t("challenge.proof.invalid") : "",
                  p.flags > 0 ? t("challenge.proof.flags", { n: p.flags }) : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </AppText>
              {p.flaggable && p.userId !== myId ? (
                <button
                  type="button"
                  onClick={() => void flag(p)}
                  disabled={busy === p.id}
                  data-testid={`proof-flag-${p.id}`}
                  className={`${actionBoxClass(p.flaggedByMe ? "neutral" : "bad")} min-h-11 self-start gap-[6px] px-[var(--spacing-md)]`}
                >
                  {p.flaggedByMe ? t("challenge.proof.unflag") : t("challenge.proof.flag")}
                </button>
              ) : null}
            </div>
          ))
        )}
        {items?.some((p) => p.flaggable && p.userId !== myId) ? (
          <AppText variant="caption" color="textFaint" className="block">
            {t("challenge.proof.flagHint")}
          </AppText>
        ) : null}
      </div>
    </SheetShell>
  );
}
