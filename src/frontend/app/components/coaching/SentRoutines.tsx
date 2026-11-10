"use client";
// 회원 화면 루틴 탭의 「보낸 루틴」(SPEC-050 P3b) — 코치가 이 회원에게 짠 루틴.
//   · 서버 ListSentRoutines(보낸 것 · 상태) + 이 기기 초안(coach_for = 회원)을 합친다.
//   · 줄 표시: 「{날짜} 보냄」 · 「보내지 않은 변경 있음」(초안을 보낸 뒤 고침) · 「아직 보내지 않음」 · 「코칭 끝남」(회색).
//   · 종목 없는 초안은 숨긴다(들어갔다 그냥 나온 것). 초안이 이 기기에 없으면 누를 수 없다(「이 기기에 초안이 없어요」).
//   · 「새 루틴 짜 주기」 = 이 기기에 초안을 만들고 편집기로.
//   · 「보내지 않은 변경 있음」 = 이 기기에서 보낸 지문 ≠ 지금 지문(리뷰 H-1) — 지문이 없으면(다른 기기에서 보냄) 고친 때 > 보낸 때.
//   · 서버 목록을 못 읽으면 상태 글을 숨긴다(「아직 보내지 않음」으로 잘못 보이지 않게 · 리뷰 L-2).
//   · localOnly(회원이 루틴 받기를 끔) — 서버를 묻지 않고 이 기기 초안만 보인다(열어서 지울 수 있게 · 리뷰 M-4).
import type { SentRoutine } from "@app/contracts";
import { SentRoutineStatus } from "@app/contracts";
import { Code, ConnectError } from "@connectrpc/connect";
import { useEffect, useState } from "react";
import { coachingClient } from "@/lib/coachingClient";
import { coachDraftSentAt } from "@/lib/coachDraftSent";
import { draftMatchesSent } from "../routines/CoachDraft";
import { lang, t } from "@/lib/i18n";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { AppText, SectionHeader } from "../ui/primitives";

type CoachDraftMod = typeof import("@app/core/data/coachDraft");

interface Row {
  key: string;
  draftId: string | null;
  name: string;
  status: "sent" | "unsent" | "never" | "ended" | "local";
  sentAt: number;
}

const day = (ms: number) =>
  new Date(ms).toLocaleDateString(lang === "en" ? "en-US" : "ko-KR", { month: "long", day: "numeric" });

export function SentRoutinesSection({
  memberId,
  onEnded,
  localOnly = false,
}: {
  memberId: string;
  onEnded?: () => void;
  /** 서버를 묻지 않고 이 기기 초안만(보내기 꺼짐) — 새로 짜기 버튼도 없다 */
  localOnly?: boolean;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let sub: { unsubscribe: () => void } | null = null;
    void (async () => {
      const d: CoachDraftMod = await import("@app/core/data/coachDraft");
      let sent: SentRoutine[] = [];
      let known = !localOnly;
      if (!localOnly) {
        try {
          sent = (await coachingClient().listSentRoutines({ memberId })).routines;
        } catch (e) {
          if (onEnded && ConnectError.from(e).code === Code.PermissionDenied) {
            onEnded();
            return;
          }
          known = false;
          if (!cancelled) setFailed(true); // 오프라인 — 이 기기 초안은 그대로 보인다
        }
      }
      if (cancelled) return;
      // 초안 행·줄이 바뀌면 다시 계산한다(편집기에서 돌아왔을 때 · 다른 기기 동기)
      sub = d
        .queryCoachDrafts(memberId)
        .observeWithColumns(["name", "updated_at"])
        .subscribe((drafts) => {
          void build(d, drafts, sent, known, localOnly).then((r) => {
            if (!cancelled) setRows(r);
          });
        });
    })();
    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  }, [memberId, onEnded, localOnly]);

  async function newDraft() {
    if (creating) return;
    setCreating(true);
    try {
      const d = await import("@app/core/data/coachDraft");
      const r = await d.createCoachDraft(memberId, t("routines.newRoutine"));
      const { navigateAfterFlush } = await import("@/lib/localDb");
      await navigateAfterFlush(`/routines/${encodeURIComponent(r.id)}`);
    } catch {
      setCreating(false);
    }
  }

  if (localOnly && (!rows || rows.length === 0)) return null; // 꺼짐 + 이 기기 초안 없음 — 안내만

  return (
    <section data-testid="sent-routines" className="mb-[var(--spacing-xl)]">
      <SectionHeader title={t(localOnly ? "coaching.member.draftsOnDevice" : "coaching.member.sentTitle")} />
      {localOnly ? null : (
        <div className="mb-[var(--spacing-md)]">
          <Button
            title={t("coaching.member.newRoutine")}
            icon="add"
            testId="btn-new-coach-routine"
            loading={creating}
            onPress={() => void newDraft()}
          />
        </div>
      )}
      {failed ? (
        <AppText variant="caption" color="textMuted" data-testid="sent-load-error" className="block">
          {t("coaching.member.sentLoadError")}
        </AppText>
      ) : null}
      {/* 못 읽었을 때는 「아직 보낸 루틴이 없어요」를 띄우지 않는다(리뷰 L-2) */}
      {rows && rows.length === 0 && !failed && !localOnly ? (
        <AppText variant="caption" color="textMuted" data-testid="sent-empty" className="block">
          {t("coaching.member.sentEmpty")}
        </AppText>
      ) : null}
      <ul className="flex flex-col gap-[var(--spacing-xs)]">
        {(rows ?? []).map((r) => (
          <li key={r.key}>
            <SentRow row={r} hideStatus={failed} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SentRow({ row, hideStatus = false }: { row: Row; hideStatus?: boolean }) {
  const label =
    row.status === "local"
      ? t("coaching.member.draftLocal")
      : row.status === "ended"
        ? t("coaching.member.sentEnded")
        : row.status === "never"
          ? t("coaching.member.notSent")
          : row.status === "unsent"
            ? t("coaching.member.unsent")
            : t("coaching.member.sentAt", { date: day(row.sentAt) });
  const sub = row.draftId ? null : t("coaching.member.noDraft");
  const body = (
    <>
      <span
        aria-hidden
        // [원본] rounded-full · [개선] 토큰(SPEC-056 F2)
        className={`h-[36px] w-[3px] shrink-0 rounded-[var(--radius-pill)] ${row.status === "ended" ? "bg-(--color-line)" : "bg-(--color-coaching)"}`}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-(--color-ink) text-[length:var(--text-md)]">
          {row.name || t("routines.newRoutine")}
        </span>
        {hideStatus ? null : (
          <span
            data-testid="sent-status"
            data-status={row.status}
            className={`block text-[length:var(--text-xs)] ${
              row.status === "unsent" ? "font-semibold text-(--color-coaching-ink)" : "text-(--color-ink2)"
            }`}
          >
            {label}
            {sub ? ` · ${sub}` : ""}
          </span>
        )}
      </span>
      {row.draftId ? <Icon name="chevron-forward" size={18} color="var(--color-ink3)" /> : null}
    </>
  );
  const cls =
    "flex min-h-14 w-full min-w-0 items-center gap-[var(--spacing-sm)] rounded-[var(--radius-md)] bg-(--color-surface) px-[var(--spacing-md)] py-[var(--spacing-xs)] text-left";
  if (!row.draftId)
    return (
      <div data-testid="sent-row" data-name={row.name} className={cls}>
        {body}
      </div>
    );
  return (
    <a
      data-testid="sent-row"
      data-name={row.name}
      href={`/routines/${encodeURIComponent(row.draftId)}`}
      className={cls}
    >
      {body}
    </a>
  );
}

/** 서버 목록 + 초안 → 줄. 같은 초안은 가장 최근 보낸 것 하나(활성 우선). */
async function build(
  d: CoachDraftMod,
  drafts: { id: string; name: string }[],
  sent: SentRoutine[],
  known: boolean,
  localOnly: boolean,
): Promise<Row[]> {
  const bySource = new Map<string, SentRoutine>();
  for (const s of sent) {
    const cur = bySource.get(s.sourceRoutineId);
    const active = s.status === SentRoutineStatus.ACTIVE;
    if (!cur || (active && cur.status !== SentRoutineStatus.ACTIVE)) bySource.set(s.sourceRoutineId, s);
  }
  const out: Row[] = [];
  const seen = new Set<string>();
  const exMod = await import("@app/core/data/routineRepository");
  for (const dr of drafts) {
    seen.add(dr.id);
    const s = bySource.get(dr.id);
    const lines = await exMod.queryRoutineExercises(dr.id).fetchCount();
    if (!s && lines === 0 && !localOnly) continue; // 빈 초안 — 숨김(나갈 때 지운다)
    const sentAt = s ? Math.max(Number(s.sentAt), coachDraftSentAt(dr.id)) : 0;
    let status: Row["status"] = known ? "never" : "local";
    if (s?.status === SentRoutineStatus.ENDED) status = "ended";
    else if (s) {
      // 이 기기에서 보낸 지문과 비교 — 지문이 없을 때만 시계로(리뷰 H-1 · 시계 비교는 보기만 해도 「변경」이 됐다)
      const same = await draftMatchesSent(dr.id);
      status = (same === null ? (await d.coachDraftEditedAt(dr.id)) > sentAt : !same) ? "unsent" : "sent";
    }
    out.push({ key: dr.id, draftId: dr.id, name: dr.name, status, sentAt });
  }
  for (const s of bySource.values()) {
    if (seen.has(s.sourceRoutineId)) continue;
    out.push({
      key: s.id,
      draftId: null,
      name: s.name,
      status: s.status === SentRoutineStatus.ENDED ? "ended" : "sent",
      sentAt: Number(s.sentAt),
    });
  }
  return out;
}
