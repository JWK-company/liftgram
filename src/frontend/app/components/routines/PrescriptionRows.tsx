"use client";
// @plm SRS-043  세트별 처방 행 — app의 features/routines/PrescriptionRows.tsx를 웹으로
//
// 루틴 편집기(로컬 저장)와 코칭 화면(원격 저장)이 **같이 쓰는** 표현 전용 컴포넌트다.
// 저장은 부르는 쪽 책임이고, 여기서는 행을 보여 주고 고치는 것만 한다.
import type { PrescribedSet, PrescribedSetType } from "@app/core";
import { LOAD_KG_MAX, LOAD_PCT_RANGE, type LoadBasis } from "@app/core/domain/prescription";
import { t } from "@/lib/i18n";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { AppText } from "../ui/primitives";

/** 칩 요약에 쓰는 한 글자 — "W W T B" 식으로 이어 붙인다. */
export const RX_SUMMARY_CHAR: Record<PrescribedSetType, string> = {
  normal: "·",
  warmup: "W",
  top: "T",
  backoff: "B",
};

export function emptyRxRow(): PrescribedSet {
  return { setType: "normal", targetRir: null, repMin: null, repMax: null, loadHint: null };
}

export function rxSummary(rx: PrescribedSet[] | null | undefined): string | null {
  if (!rx || rx.length === 0) return null;
  return rx.map((r) => RX_SUMMARY_CHAR[r.setType] ?? "·").join(" ");
}

/** 타입은 버튼을 누를 때마다 이 순서로 돈다. */
const CYCLE: PrescribedSetType[] = ["normal", "warmup", "top", "backoff"];

/** 무게 기준도 누를 때마다 돈다 — 없음 → 1RM % → 탑셋 % → 직접(kg). @plm SRS-063 */
const LOAD_CYCLE: (LoadBasis | null)[] = [null, "pct1rm", "pctTop", "fixed"];
const LOAD_DEFAULT: Record<LoadBasis, Partial<PrescribedSet>> = {
  pct1rm: { loadPct: 80, loadKg: undefined },
  pctTop: { loadPct: 90, loadKg: undefined },
  fixed: { loadKg: 20, loadPct: undefined },
};

/** 한 행이라도 뜻이 있으면 처방이다 — 무게 기준도 뜻이다(편집기 두 곳이 같은 판정을 쓴다). */
export function rxMeaningful(rows: PrescribedSet[]): boolean {
  return rows.some(
    (r) =>
      r.setType !== "normal" || r.targetRir != null || r.repMin != null || r.repMax != null || !!r.loadBasis,
  );
}

export function PrescriptionRows({
  rows,
  onChange,
  allowLoad = true,
}: {
  rows: PrescribedSet[];
  onChange: (next: PrescribedSet[]) => void;
  /** 무게 기준을 고를 수 있는가 — 맨몸·어시스트 종목은 % 기준이 뜻이 없다(SRS-063). */
  allowLoad?: boolean;
}) {
  const patch = (i: number, p: Partial<PrescribedSet>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)));

  /** 빈칸·음수·숫자가 아니면 null. RIR은 0~6이 의미 있는 범위라 위를 자른다. */
  const setNum = (i: number, key: "targetRir" | "repMin" | "repMax", txt: string) => {
    const n = Number.parseInt(txt, 10);
    const v = Number.isNaN(n) || n < 0 ? null : key === "targetRir" ? Math.min(6, n) : n;
    patch(i, { [key]: v } as Partial<PrescribedSet>);
  };

  return (
    <div>
      <div className="flex items-center gap-[4px] pb-[4px]">
        <span className="w-[86px]">
          <AppText variant="label" color="textFaint">
            {t("routines.rxColType")}
          </AppText>
        </span>
        {(["routines.rxColRir", "routines.rxColRepMin", "routines.rxColRepMax"] as const).map((k) => (
          <span key={k} className="flex-1 text-center">
            <AppText variant="label" color="textFaint">
              {t(k)}
            </AppText>
          </span>
        ))}
        <span className="w-8" />
      </div>

      <div className="max-h-[320px] overflow-y-auto">
        {rows.map((r, i) => (
          // 처방 행은 **자리 자체가 뜻**이다(1세트·2세트…). 순서를 바꾸는 조작이 없고 값도 전부
          // props에서 오므로, 인덱스를 키로 써도 상태가 엉키지 않는다.
          // biome-ignore lint/suspicious/noArrayIndexKey: 위치가 곧 정체성인 행이다
          <div key={i} className="py-[3px]">
            <div className="flex items-center gap-[4px]">
              <div className="w-[86px]">
                <Button
                  title={t(`routines.rxType.${r.setType}` as Parameters<typeof t>[0])}
                  size="sm"
                  variant={r.setType === "normal" ? "ghost" : "secondary"}
                  fullWidth={false}
                  testId="rx-type"
                  onPress={() => patch(i, { setType: CYCLE[(CYCLE.indexOf(r.setType) + 1) % CYCLE.length] })}
                />
              </div>
              {(["targetRir", "repMin", "repMax"] as const).map((key) => (
                <input
                  key={key}
                  inputMode="numeric"
                  placeholder="–"
                  data-testid={`rx-${key}`}
                  value={r[key] == null ? "" : String(r[key])}
                  onChange={(e) => setNum(i, key, e.target.value)}
                  className="h-[38px] min-w-0 flex-1 rounded-[var(--radius-sm)] border border-(--color-line) bg-(--color-surface-alt) text-center text-[length:var(--text-md)] text-(--color-ink) placeholder:text-(--color-ink3)"
                />
              ))}
              <IconButton
                icon="close"
                size={16}
                label={t("common.delete")}
                color="var(--color-ink3)"
                className="h-8! w-8!"
                // 행이 하나뿐이면 지우지 않는다 — 빈 표가 되면 무엇을 고쳐야 할지 알 수 없다.
                onPress={() => rows.length > 1 && onChange(rows.filter((_, idx) => idx !== i))}
              />
            </div>
            {/* 무게 기준(#56) — 그 세트의 무게를 어떻게 정하는지. 계산은 운동 시작·탑셋을 마칠 때 한다. @plm SRS-063 */}
            {allowLoad ? (
              <div className="flex items-center gap-[4px] pb-[4px] pl-[90px]">
                <Button
                  title={t(`routines.rxLoad.${r.loadBasis ?? "none"}` as Parameters<typeof t>[0])}
                  size="sm"
                  variant={r.loadBasis ? "secondary" : "ghost"}
                  fullWidth={false}
                  testId="rx-load-basis"
                  onPress={() => {
                    const next =
                      LOAD_CYCLE[(LOAD_CYCLE.indexOf(r.loadBasis ?? null) + 1) % LOAD_CYCLE.length];
                    patch(
                      i,
                      next
                        ? { loadBasis: next, ...LOAD_DEFAULT[next] }
                        : { loadBasis: undefined, loadPct: undefined, loadKg: undefined },
                    );
                  }}
                />
                {r.loadBasis ? (
                  <>
                    <input
                      inputMode="decimal"
                      data-testid="rx-load-value"
                      value={String(r.loadBasis === "fixed" ? (r.loadKg ?? "") : (r.loadPct ?? ""))}
                      onChange={(e) => {
                        const n = Number.parseFloat(e.target.value.replace(",", "."));
                        if (r.loadBasis === "fixed") {
                          patch(i, {
                            loadKg: Number.isNaN(n) ? undefined : Math.min(LOAD_KG_MAX, Math.max(0, n)),
                          });
                        } else {
                          const [, hi] = LOAD_PCT_RANGE[r.loadBasis as "pct1rm" | "pctTop"];
                          patch(i, {
                            loadPct: Number.isNaN(n) ? undefined : Math.min(hi, Math.max(0, Math.round(n))),
                          });
                        }
                      }}
                      className="h-[34px] w-[64px] rounded-[var(--radius-sm)] border border-(--color-line) bg-(--color-surface-alt) text-center text-[length:var(--text-md)] text-(--color-ink)"
                    />
                    <AppText variant="caption" color="textMuted">
                      {r.loadBasis === "fixed" ? "kg" : "%"}
                    </AppText>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-[var(--spacing-sm)]">
        <Button
          title={t("routines.rxAddSet")}
          icon="add"
          variant="secondary"
          size="sm"
          onPress={() => onChange([...rows, emptyRxRow()])}
        />
      </div>
    </div>
  );
}
