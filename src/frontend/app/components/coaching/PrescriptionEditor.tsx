"use client";
// @plm SRS-048  회원 처방 편집 — app의 features/coaching/MemberRoutinesPanel.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 편집 UI는 **루틴 편집기와 같은 것을 쓴다**(`PrescriptionRows`). 처방의 언어(세트 타입·RIR·
// 반복 범위)가 트레이너 화면과 회원 화면에서 다르면, 같은 말을 다르게 읽게 된다.
//
// ── 계약과 도메인 사이 ──────────────────────────────────────────────────────
// 서버는 enum과 `-1 = 미지정`으로 말하고, 화면(도메인)은 문자열과 `null`로 말한다.
// 그 번역이 이 파일에 있다 — 화면은 도메인 어휘만 알면 된다.
//
// ── 저장은 회원의 데이터를 고치는 일이다 ────────────────────────────────────
// 그래서 저장 버튼 옆에 "이력에 남는다"고 적어 둔다. 숨기고 고치는 것이 아니라는 표시다.
// ─────────────────────────────────────────────────────────────────────────────
import type { Peer, Routine, RoutineExercise } from "@app/contracts";
import { LoadHint as LoadHintPB, SetType as SetTypePB } from "@app/contracts";
import type { PrescribedSet } from "@app/core";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { coachingClient } from "@/lib/coachingClient";
import { emptyRxRow, PrescriptionRows } from "../routines/PrescriptionRows";
import { useToast } from "../Toast";
import { Panel } from "./Panel";
import { Button } from "../ui/Button";
import { AppText } from "../ui/primitives";

/** 미지정 RIR. 계약에 "값 없음"이 없어 정한 약속이다(0은 "실패까지"라는 뜻이라 쓸 수 없다). */
const RIR_UNSET = -1;

const SET_TYPE_NAME: Record<SetTypePB, PrescribedSet["setType"]> = {
  [SetTypePB.UNSPECIFIED]: "normal",
  [SetTypePB.WARMUP]: "warmup",
  [SetTypePB.TOP]: "top",
  [SetTypePB.BACKOFF]: "backoff",
  [SetTypePB.NORMAL]: "normal",
};
const SET_TYPE_PB: Record<string, SetTypePB> = {
  warmup: SetTypePB.WARMUP,
  top: SetTypePB.TOP,
  backoff: SetTypePB.BACKOFF,
  normal: SetTypePB.NORMAL,
};
const LOAD_NAME: Record<LoadHintPB, PrescribedSet["loadHint"]> = {
  [LoadHintPB.UNSPECIFIED]: null,
  [LoadHintPB.LIGHT]: "light",
  [LoadHintPB.MEDIUM]: "medium",
  [LoadHintPB.HEAVY]: "heavy",
};
const LOAD_PB: Record<string, LoadHintPB> = {
  light: LoadHintPB.LIGHT,
  medium: LoadHintPB.MEDIUM,
  heavy: LoadHintPB.HEAVY,
};

/** 계약 → 도메인. 화면은 이 모양만 안다. */
export function toDomainRows(rows: RoutineExercise["prescription"]): PrescribedSet[] {
  return rows.map((r) => ({
    setType: SET_TYPE_NAME[r.setType] ?? "normal",
    targetRir: r.targetRir === RIR_UNSET ? null : r.targetRir,
    repMin: r.repMin > 0 ? r.repMin : null,
    repMax: r.repMax > 0 ? r.repMax : null,
    loadHint: LOAD_NAME[r.loadHint] ?? null,
  }));
}

/** 도메인 → 계약. `null`은 계약이 아는 "없음"(-1·0)으로 옮긴다. */
function toContractRows(rows: PrescribedSet[]) {
  return rows.map((r) => ({
    setType: SET_TYPE_PB[r.setType] ?? SetTypePB.NORMAL,
    targetRir: r.targetRir ?? RIR_UNSET,
    repMin: r.repMin ?? 0,
    repMax: r.repMax ?? 0,
    loadHint: r.loadHint ? (LOAD_PB[r.loadHint] ?? LoadHintPB.UNSPECIFIED) : LoadHintPB.UNSPECIFIED,
  }));
}

export function PrescriptionEditor({
  peer,
  routine,
  block,
  onClose,
  onSaved,
}: {
  peer: Peer;
  routine: Routine;
  block: RoutineExercise;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<PrescribedSet[]>(() => {
    const existing = toDomainRows(block.prescription);
    if (existing.length > 0) return existing;
    // 처방이 없으면 회원이 정한 세트 수만큼 빈 줄을 깐다 — 빈 화면에서 시작하지 않게.
    return Array.from({ length: Math.max(1, block.targetSets || 1) }, emptyRxRow);
  });
  const [saving, setSaving] = useState(false);

  // 아무것도 지정하지 않은 처방은 **처방이 아니다** — 그대로 저장하면 회원 화면에
  // 의미 없는 표시만 는다. 그럴 땐 지우는 것으로 본다.
  const meaningful = rows.some(
    (r) => r.setType !== "normal" || r.targetRir != null || r.repMin != null || r.repMax != null,
  );

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await coachingClient().setMemberPrescription({
        memberId: peer.id,
        routineId: routine.id,
        routineExerciseId: block.id,
        prescription: meaningful ? toContractRows(rows) : [],
      });
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      testId="rx-editor"
      title={block.exerciseName || block.exerciseId}
      onClose={onClose}
      actions={
        <>
          <Button title={t("common.cancel")} variant="secondary" onPress={onClose} testId="rx-cancel" />
          <Button title={t("common.save")} loading={saving} onPress={save} testId="rx-save" />
        </>
      }
    >
      <AppText variant="caption" color="textMuted" className="mb-[var(--spacing-sm)] block">
        {t("coaching.rxEditorHint", { name: peer.displayName || "?" })}
      </AppText>
      <PrescriptionRows rows={rows} onChange={setRows} />
    </Panel>
  );
}
