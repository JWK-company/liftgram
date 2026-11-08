"use client";
// 「이 기록이 맞나요?」 — 튀는 기록 확인 시트(SPEC-044 · SRS-109 R3). 운동 중 세트 칩·완료 요약·기록 상세·종목 상세가 같이 쓴다.
//
// 버튼(REV-079 UX-1): 「lb로 적었어요 → 59.9kg」(lb 로 읽으면 평소 범위에 들 때만 · 주 버튼) · 「제대로 적었어요」 · 「직접 고치기」(조용한 버튼).
// 처리하면 저장소가 그 운동과 이후 운동을 다시 센다. 직후 토스트의 「되돌리기」로 되돌린다(UX-8).
// 운동 중에는 이 시트를 스스로 띄우지 않는다 — 사람이 칩을 눌렀을 때만(휴식 중 방해 금지 · UX-10).
import { formatEnteredWeight, type WeightUnit } from "@app/core";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { errorText } from "@/lib/errorText";
import { useToast } from "../Toast";
import { Button } from "../ui/Button";
import { SheetShell } from "../ui/Dialog";
import { AppText } from "../ui/primitives";

const KG_PER_LB = 0.45359237;

export interface SuspectInfo {
  setId: string;
  setNumber: number;
  exerciseName: string;
  weightKg: number;
  reps: number;
  unit: WeightUnit;
  usualKg: [number, number] | null;
  lbPlausible: boolean;
  /** 무게가 튀었나 · 횟수가 튀었나 — 문구가 다르다(UX 리뷰 1) */
  reason?: "weight" | "reps" | null;
}

/** 「평소 55~60kg」 — 블록 단위로(REV-079 C-9a) */
export function usualText(usual: [number, number] | null, unit: WeightUnit): string | null {
  if (!usual) return null;
  const [lo, hi] = usual;
  const a = formatEnteredWeight(lo, unit, { withUnit: false });
  const b = formatEnteredWeight(hi, unit);
  return Math.abs(hi - lo) < 1e-6 ? b : `${a}~${b}`;
}

/** 시트 본문·버튼 — 기록 상세 고치기 시트 위에도 그대로 얹는다(UX-5) */
export function SuspectPanel({
  info,
  onDone,
  onRefresh,
  onEdit,
}: {
  info: SuspectInfo;
  onDone: () => void;
  /** 되돌리기 뒤 — 다시 읽기만(그 사이 열린 다른 창을 닫지 않게 · 화면 리뷰 2). 없으면 onDone */
  onRefresh?: () => void;
  onEdit?: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const weight = formatEnteredWeight(info.weightKg, info.unit);
  const usual = usualText(info.usualKg, info.unit);
  const lbKg = Math.round(info.weightKg * KG_PER_LB * 1000) / 1000;
  // 버튼·토스트 글은 0.1 자리(「59.9kg」 · 스펙 예시) — 저장은 0.001(59.874)
  const lbShown = formatEnteredWeight(Math.round(lbKg * 10) / 10, "kg");

  const run = (kind: "lb" | "confirm") => {
    if (busy) return;
    setBusy(true);
    void (async () => {
      try {
        const repo = await import("@app/core/data/workoutRepository");
        // 되돌리기에 쓸 옛 값 — lb 는 무게·사람이 고침·값 출처까지, 확인은 상태만
        const prev: import("@app/core/data/workoutRepository").SuspectFixPrev =
          kind === "lb" ? await repo.fixSuspectAsLb(info.setId) : await repo.confirmSuspectSet(info.setId);
        const { flushLocalDb } = await import("@/lib/localDb");
        await flushLocalDb();
        onDone();
        const msg =
          kind === "lb" ? t("check.fixedLb", { before: weight, after: lbShown }) : t("check.confirmed");
        toast(msg, "info", {
          label: t("check.undo"),
          testId: "check-undo",
          onPress: () =>
            void (async () => {
              await repo.undoSuspectFix(info.setId, prev);
              await flushLocalDb();
              (onRefresh ?? onDone)();
              toast(t("check.undone"));
            })().catch((e) => toast(errorText(e), "error")),
        });
      } catch (e) {
        toast(errorText(e), "error");
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div data-testid="check-panel" data-set-id={info.setId}>
      <AppText variant="body" className="mb-[var(--spacing-xs)] block">
        {info.reason === "reps"
          ? t("check.bodyReps", { name: info.exerciseName, weight, reps: info.reps })
          : usual
            ? t("check.body", { name: info.exerciseName, weight, reps: info.reps, usual })
            : t("check.bodyNoUsual", { name: info.exerciseName, weight, reps: info.reps })}
      </AppText>
      <AppText variant="caption" color="textMuted" className="mb-[var(--spacing-md)] block">
        {t("check.note")}
      </AppText>
      <div className="flex flex-col gap-[var(--spacing-sm)]">
        {info.lbPlausible && info.unit === "kg" ? (
          <Button
            title={t("check.asLb", { kg: lbShown })}
            testId="check-as-lb"
            loading={busy}
            onPress={() => run("lb")}
          />
        ) : null}
        <Button
          title={t("check.confirm")}
          // [원본] lb 권유가 없으면 주 버튼 — 실수일 가능성이 큰 기록을 「맞다」로 넘기게 이끌었다(UX 리뷰 2)
          variant="secondary"
          testId="check-confirm"
          disabled={busy}
          onPress={() => run("confirm")}
        />
        {onEdit ? (
          <Button
            title={t("check.edit")}
            variant="quiet"
            testId="check-edit"
            disabled={busy}
            onPress={onEdit}
          />
        ) : null}
      </div>
    </div>
  );
}

export function SuspectSetSheet({
  info,
  onClose,
  onDone,
  onRefresh,
  onEdit,
}: {
  info: SuspectInfo;
  onClose: () => void;
  /** 처리 뒤 — 부르는 쪽이 다시 읽는다(시트는 닫힌다) */
  onDone: () => void;
  /** 되돌리기 뒤 — 다시 읽기만(없으면 onDone) */
  onRefresh?: () => void;
  onEdit?: () => void;
}) {
  return (
    <SheetShell title={t("check.title")} onClose={onClose} hideOk testId="check-sheet">
      <SuspectPanel
        info={info}
        onDone={() => {
          onClose();
          onDone();
        }}
        onRefresh={onRefresh ?? onDone}
        onEdit={
          onEdit
            ? () => {
                onClose();
                onEdit();
              }
            : undefined
        }
      />
    </SheetShell>
  );
}
