"use client";
// 목록 안 표식은 「routine-」로 시작하지 않는다(e2e 가 [data-testid^=routine-] 를 루틴 줄로 센다 · RoutinePreviewSheet 참고).
// 루틴 출처 표시(SPEC-050 P3a · REV-097) — 코치가 보낸 루틴은 왼쪽 청록 띠 + 종목 줄 쪽 「코치 ○○」 칩(+새로 받으면 점),
// 끝난 코칭은 회색 「코칭 끝남」, 가져온 루틴은 회색 「가져옴」. 내가 만든 루틴은 아무것도 붙이지 않는다.
// 판정은 core(domain/routineOrigin.ts)가 한다 — 여기는 그리기만.
import { routineOriginBadge } from "@app/core";
import type { CSSProperties } from "react";
import { t } from "@/lib/i18n";
import { useCoachRoutineSeen } from "@/lib/coachRoutineSeen";

/** 화면이 루틴 모델에서 읽는 출처 칸 */
export interface RoutineOriginFields {
  id: string;
  origin?: string | null;
  coachName?: string | null;
}

/** 코치 루틴 왼쪽 청록 띠 — 안쪽 그림자라 줄 폭·글자 자리가 바뀌지 않는다(띠만 · 판 색은 그대로). */
export function originStripeStyle(r: RoutineOriginFields): CSSProperties | undefined {
  return routineOriginBadge(r)?.kind === "coach"
    ? { boxShadow: "inset 3px 0 0 var(--color-coaching)" }
    : undefined;
}

export function isFromCoach(r: RoutineOriginFields): boolean {
  return routineOriginBadge(r)?.kind === "coach";
}

/** 「코치 ○○」(청록) · 「코칭 끝남」·「가져옴」(회색) 칩. 내 루틴이면 아무것도 그리지 않는다. */
export function RoutineOriginChip({
  routine,
  testId = "origin-chip",
}: {
  routine: RoutineOriginFields;
  testId?: string;
}) {
  const b = routineOriginBadge(routine);
  if (!b) return null;
  if (b.kind === "coach") {
    return (
      <span
        data-testid={testId}
        data-origin="coach"
        // [원본] className="inline-flex max-w-[11em] shrink-0 items-center gap-[4px] rounded-[var(--radius-pill)] bg-(--color-coaching-soft) px-[8px] py-[1px] font-semibold text-(--color-coaching-ink) text-[length:var(--text-xs)]" — 정보는 판 없이 글자만 — 코칭은 coaching-ink(SPEC-057 R2)
        className="inline-flex max-w-[11em] shrink-0 items-center gap-[4px] font-semibold text-(--color-coaching-ink) text-[length:var(--text-xs)]"
      >
        {/* 코칭 표시는 판 대신 앞의 코칭색 점(SPEC-057 R2 색 표) */}
        <span aria-hidden className="h-[6px] w-[6px] shrink-0 rounded-full bg-(--color-coaching)" />
        <span className="truncate">
          {b.coachName ? t("routines.originCoach", { name: b.coachName }) : t("routines.originCoachNoName")}
        </span>
        <NewDot routineId={routine.id} />
      </span>
    );
  }
  return (
    <span
      data-testid={testId}
      data-origin={b.kind === "coachEnded" ? "coach_ended" : "import"}
      // [원본] className="inline-flex shrink-0 items-center rounded-[var(--radius-pill)] bg-(--color-surface-alt) px-[8px] py-[1px] font-semibold text-(--color-ink2) text-[length:var(--text-xs)]" — 정보는 판 없이 글자만(SPEC-057 R2)
      className="inline-flex shrink-0 items-center gap-[4px] font-semibold text-(--color-ink2) text-[length:var(--text-xs)]"
    >
      {/* 판을 걷어 뒤 종목 줄과 이어 읽히지 않게 앞에 점(REV-131) */}
      <span aria-hidden className="h-[6px] w-[6px] shrink-0 rounded-full bg-(--color-ink3)" />
      {b.kind === "coachEnded" ? t("routines.originCoachEnded") : t("routines.originImport")}
    </span>
  );
}

/** 새로 받은 코치 루틴 점 — 처음 열면(markCoachRoutineSeen) 사라진다. */
function NewDot({ routineId }: { routineId: string }) {
  const seen = useCoachRoutineSeen(routineId);
  if (seen) return null;
  return (
    <span data-testid="coach-new-dot" className="inline-flex shrink-0">
      <span aria-hidden className="h-[6px] w-[6px] rounded-full bg-(--color-coaching)" />
      <span className="sr-only">{t("routines.originNew")}</span>
    </span>
  );
}

/** 코치 루틴 머리 띠 — 「코치 ○○님이 짠 루틴이에요」 + 안내(미리보기·보기 화면). */
export function CoachRoutineBanner({
  routine,
  // [원본] hint = true, — 안내 줄(routines.coachLockedHint)을 그리지 않는다(SPEC-055 Phase 4) · prop 은 부르는 곳 때문에 남김
}: {
  routine: RoutineOriginFields;
  hint?: boolean;
}) {
  const b = routineOriginBadge(routine);
  if (b?.kind !== "coach") return null;
  return (
    <div
      data-testid="coach-routine-banner"
      // [원본] rounded-[var(--radius-md)] — 판 모서리는 4px 하나로(SPEC-057 REV-131 H3)
      className="mb-[var(--spacing-md)] rounded-[var(--radius-sm)] border-(--color-coaching) border-l-[3px] bg-(--color-coaching-soft) px-[var(--spacing-md)] py-[var(--spacing-sm)]"
    >
      <span className="block font-semibold text-(--color-coaching-ink) text-[length:var(--text-sm)]">
        {b.coachName
          ? t("routines.coachLockedBanner", { name: b.coachName })
          : t("routines.coachLockedBannerNoName")}
      </span>
      {/* [원본] {hint ? (
        <span className="mt-[2px] block text-(--color-ink2) text-[length:var(--text-xs)]">
          {t("routines.coachLockedHint")}
        </span>
      ) : null} */}
      {/* [개선] 설명 줄 없앰(SPEC-055 Phase 4) */}
    </div>
  );
}
