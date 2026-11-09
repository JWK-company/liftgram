"use client";
// 코치 초안 모드 조각(SPEC-050 P3b) — RoutineEditor 가 routine.coach_for 를 보면 쓴다.
//   · 청록 띠 「○○님께 보낼 루틴」(회원 화면 띠와 같은 색 · 내 루틴과 헷갈리지 않게)
//     연결이 끝났으면 「코칭이 끝났어요」 · 회원이 루틴 받기를 껐으면 그 안내 — 둘 다 보내기를 막는다(리뷰 M-4)
//   · 회원 이름·상태는 ListGrants 에서 — 모르면(오프라인) 「회원」 · 보내기는 서버가 판단한다
//   · 보내기 = 직접 만든 종목 미리 알림 → SendRoutine → 보낸 내용의 지문을 이 기기에 기록(리뷰 H-1)
import { GrantStatus, Side } from "@app/contracts";
import { useEffect, useState } from "react";
import { coachingClient } from "@/lib/coachingClient";
import { coachDraftSentMark, markCoachDraftSent } from "@/lib/coachDraftSent";
import { t } from "@/lib/i18n";

export interface DraftMember {
  name: string;
  /** 활성 연결이 있나 — null = 아직 모름(읽는 중·오프라인) */
  active: boolean | null;
  /** 회원이 루틴 받기를 켜 뒀나 — null = 모름 */
  routineEdit: boolean | null;
}

export function useDraftMember(memberId: string | null): DraftMember {
  const [state, setState] = useState<DraftMember>({
    name: t("coaching.draft.member"),
    active: null,
    routineEdit: null,
  });
  useEffect(() => {
    if (!memberId) return;
    let cancelled = false;
    coachingClient()
      .listGrants({})
      .then((r) => {
        if (cancelled) return;
        // 끝난 연결도 이름은 쓴다(띠 「코칭이 끝났어요」에 누구인지 남게)
        const mine = r.grants.filter((x) => x.peer?.id === memberId && x.roleOfMe === Side.TRAINER);
        const g = mine.find((x) => x.status === GrantStatus.ACTIVE);
        setState({
          name: (g ?? mine[0])?.peer?.displayName || t("coaching.draft.member"),
          active: !!g,
          routineEdit: g ? !!g.scope?.routineEdit : null,
        });
      })
      .catch(() => {
        /* 오프라인 — 이름 없이 「회원」으로 둔다 · 보내기는 서버가 판단한다 */
      });
    return () => {
      cancelled = true;
    };
  }, [memberId]);
  return state;
}

/** 지금 보낼 수 있나 — 끝났거나 범위를 껐다고 **확인된** 때만 막는다(모르면 서버에 맡긴다). */
export function draftBlocked(m: DraftMember): "ended" | "off" | null {
  if (m.active === false) return "ended";
  if (m.routineEdit === false) return "off";
  return null;
}

export function CoachDraftBand({ member }: { member: DraftMember }) {
  const blocked = draftBlocked(member);
  return (
    <div
      data-testid="coach-draft-band"
      data-blocked={blocked ?? ""}
      className={`border-l-4 px-[var(--spacing-md)] py-[var(--spacing-sm)] ${
        blocked
          ? "border-(--color-line) bg-(--color-surface)"
          : "border-(--color-coaching) bg-(--color-coaching-soft)"
      }`}
    >
      <p
        className={`font-semibold text-[length:var(--text-md)] ${blocked ? "text-(--color-ink)" : "text-(--color-coaching-ink)"}`}
      >
        {t("coaching.draft.band", { name: member.name })}
      </p>
      <p
        data-testid="coach-draft-band-hint"
        className="mt-[2px] text-(--color-ink2) text-[length:var(--text-xs)]"
      >
        {blocked === "ended"
          ? t("coaching.draft.ended")
          : blocked === "off"
            ? t("coaching.draft.routineOff")
            : t("coaching.draft.bandHint")}
      </p>
    </div>
  );
}

/** 직접 만든 종목이 든 초안 — errorText 가 약속된 코드로 알아보고 이름을 끼운다(리뷰 L-1). */
export const COACH_DRAFT_CUSTOM = "COACH_DRAFT_CUSTOM";
export class CoachDraftCustomError extends Error {
  readonly params: { name: string };
  constructor(name: string) {
    super(COACH_DRAFT_CUSTOM);
    this.params = { name };
  }
}

/** 보내기 — 실패는 던진다(편집기가 토스트). 직접 만든 종목은 서버까지 가지 않고 막는다. */
export async function sendCoachDraft(memberId: string, draftId: string): Promise<{ created: boolean }> {
  const d = await import("@app/core/data/coachDraft");
  const custom = await d.coachDraftCustomExercise(draftId);
  if (custom) {
    // 이름은 표시 언어로(내가 부르는 이름 · 영어 화면이면 영어) — 못 찾으면 저장된 이름
    const { getExerciseDisplayName } = await import("@/lib/exerciseNames");
    const name = (await getExerciseDisplayName(custom.id).catch(() => null)) || custom.nameKo;
    throw new CoachDraftCustomError(name);
  }
  const input = await d.coachDraftSendInput(draftId);
  const res = await coachingClient().sendRoutine({ memberId, ...input });
  markCoachDraftSent(draftId, d.coachDraftHash(input));
  return { created: res.created };
}

/** 이 기기에서 보낸 지문과 지금 내용이 같은가 — 지문이 없으면 null(다른 기기에서 보냄·저장 막힘). */
export async function draftMatchesSent(draftId: string): Promise<boolean | null> {
  const mark = coachDraftSentMark(draftId);
  if (!mark) return null;
  const d = await import("@app/core/data/coachDraft");
  return d.coachDraftHash(await d.coachDraftSendInput(draftId)) === mark.h;
}

/**
 * 이 초안을 보낸 적이 있나(리뷰 M-3) — 이 기기 기록이 있으면 true, 없으면 서버 ListSentRoutines 로.
 * 못 물으면(오프라인·실패) null — 부르는 쪽은 null 이면 지우지 않는다.
 */
export async function draftEverSent(memberId: string, draftId: string): Promise<boolean | null> {
  if (coachDraftSentMark(draftId)) return true;
  try {
    // 나가는 길을 오래 막지 않는다 — 4초 안에 답이 없으면 「모름」(지우지 않는다)
    const r = await Promise.race([
      coachingClient().listSentRoutines({ memberId }),
      new Promise<null>((res) => setTimeout(() => res(null), 4000)),
    ]);
    if (!r) return null;
    return r.routines.some((s) => s.sourceRoutineId === draftId);
  } catch {
    return null;
  }
}
