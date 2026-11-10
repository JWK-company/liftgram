"use client";
// 처방 대 실제 표(SPEC-050 P4) — 코치가 보낸 루틴으로 한 운동 블록 하나. 계산은 core planVsActual(순번 짝 · 사실만).
//   줄 = 순번 · 처방(세트 종류 글자·횟수·RIR·무게 기준) · 실제(무게×횟수) · 상태(범위 안·적게·많이·안 함·계획 밖)
//   상태 색은 빨강을 쓰지 않는다 — 빨강은 화면의 주 버튼 몫이고, 이 표는 판정이 아니라 사실이다(ADR-028).
import type { WeightUnit } from "@app/core";
import type { PlanVsActual, PlanVsActualRow, PlanVsActualStatus } from "@app/core/domain/planVsActual";
import { type PrescribedSetType, repRangeLabel } from "@app/core/domain/prescription";
import { displayWeight } from "@app/core/domain/units";
import { t, type TransKey } from "@/lib/i18n";
import { RX_SUMMARY_CHAR } from "../routines/PrescriptionRows";
import { AppText } from "../ui/primitives";

const STATUS_KEY: Record<PlanVsActualStatus, TransKey | null> = {
  hit: "coaching.plan.hit",
  under: "coaching.plan.under",
  over: "coaching.plan.over",
  missed: "coaching.plan.missed",
  extra: "coaching.plan.extra",
  done: null,
};

/** 세트 종류 이름(W·T·B·D·P 글자를 화면 읽기·마우스 올림으로 풀어 준다 · 리뷰) */
const RX_TYPE_NAME: Record<PrescribedSetType, TransKey> = {
  normal: "routines.rxType.normal",
  warmup: "routines.rxType.warmup",
  top: "routines.rxType.top",
  backoff: "routines.rxType.backoff",
  drop: "routines.rxType.drop",
  feeder: "routines.rxType.feeder",
};

// [원본] planLabel(r, unit): string — 종류 글자(W/T/B)를 글로만 붙였다
// [개선] 종류 글자는 따로 돌려준다(그리는 쪽이 title·sr-only 이름을 단다) · 나머지는 글
function planLabel(
  r: PlanVsActualRow,
  unit: WeightUnit,
): { typeChar: string | null; typeName: string; rest: string } {
  const p = r.plan;
  if (!p) return { typeChar: null, typeName: "", rest: "—" };
  const bits: string[] = [];
  const ch = RX_SUMMARY_CHAR[p.setType];
  const typeChar = p.setType !== "normal" && ch ? ch : null;
  if (p.amrap) bits.push(t("coaching.plan.amrap"));
  else {
    const reps = repRangeLabel(p.repMin, p.repMax);
    // [원본] bits.push(t("coaching.member.reps", { count: reps })) — 영어가 「1 reps」
    if (reps)
      bits.push(reps === "1" ? t("coaching.member.repsOne") : t("coaching.member.reps", { count: reps }));
  }
  if (p.targetRir != null) bits.push(`RIR ${p.targetRir}`);
  if ((p.loadBasis === "fixed" || p.loadBasis === "start") && p.loadKg != null && p.loadKg > 0)
    bits.push(`${displayWeight(p.loadKg, unit)}${unit}`);
  else if (p.loadBasis === "pct1rm" && p.loadPct)
    bits.push(t("prescription.load.labelPct1rm", { pct: p.loadPct }));
  else if (p.loadBasis === "pctTop" && p.loadPct)
    bits.push(t("prescription.load.labelPctTop", { pct: p.loadPct }));
  else if (r.planWeightKg) bits.push(`${displayWeight(r.planWeightKg, unit)}${unit}`);
  return {
    typeChar,
    typeName: t(RX_TYPE_NAME[p.setType] ?? "routines.rxType.normal"),
    rest: bits.length ? bits.join(" · ") : typeChar ? "" : "—",
  };
}

function PlanCell({ r, unit }: { r: PlanVsActualRow; unit: WeightUnit }) {
  const { typeChar, typeName, rest } = planLabel(r, unit);
  return (
    <>
      {typeChar ? (
        <>
          <span aria-hidden="true" title={typeName} data-testid="plan-actual-type">
            {typeChar}
          </span>
          <span className="sr-only">{typeName}</span>
          {rest ? " · " : ""}
        </>
      ) : null}
      {rest}
    </>
  );
}

export function PlanActualTable({
  pva,
  actualLabel,
  unit,
}: {
  pva: PlanVsActual;
  actualLabel: (r: PlanVsActualRow) => string;
  unit: WeightUnit;
}) {
  return (
    <div data-testid="plan-actual" className="mt-[var(--spacing-xs)] min-w-0">
      <AppText
        variant="caption"
        color="textMuted"
        className="mb-[2px] block truncate"
        data-testid="plan-actual-summary"
      >
        {t("coaching.plan.summary", { planned: pva.planned, done: pva.done, hit: pva.hit })}
      </AppText>
      <table className="w-full table-fixed border-collapse text-[length:var(--text-xs)]">
        <thead>
          <tr className="text-left text-(--color-ink3)">
            <th scope="col" className="w-6 py-[2px] font-normal">
              #
            </th>
            <th scope="col" className="py-[2px] font-normal">
              {t("coaching.plan.planCol")}
            </th>
            <th scope="col" className="py-[2px] font-normal">
              {t("coaching.plan.actualCol")}
            </th>
            <th scope="col" className="w-16 py-[2px] text-right font-normal">
              {/* [원본] sr-only {t("coaching.plan.title")} — 열 이름이 표 제목과 같았다 · [개선] 「상태」 */}
              <span className="sr-only">{t("coaching.plan.statusCol")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {pva.rows.map((r) => {
            const key = STATUS_KEY[r.status];
            const strong = r.status === "under" || r.status === "missed";
            return (
              <tr
                key={r.index}
                data-testid="plan-actual-row"
                data-status={r.status}
                className="border-(--color-line) border-t align-top"
              >
                <td className="py-[3px] text-(--color-ink3)">{r.index + 1}</td>
                <td
                  className="break-words py-[3px] pr-[var(--spacing-xs)] text-(--color-ink2)"
                  data-testid="plan-actual-plan"
                >
                  <PlanCell r={r} unit={unit} />
                </td>
                <td
                  className="break-words py-[3px] pr-[var(--spacing-xs)] text-(--color-ink)"
                  data-testid="plan-actual-actual"
                >
                  {r.actual ? actualLabel(r) : "—"}
                </td>
                <td
                  className={`py-[3px] text-right ${strong ? "font-semibold text-(--color-coaching-ink)" : "text-(--color-ink3)"}`}
                  data-testid="plan-actual-status"
                >
                  {key ? t(key) : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
