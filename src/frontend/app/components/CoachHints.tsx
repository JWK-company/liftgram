"use client";
// 숨은 동작 첫 안내 세 개(SPEC-046 · SRS-111 R4) — 화면 수준에서 한 번만 그린다(ActiveWorkout · RoutineEditor).
// 상황 판단은 화면 표식으로 한다: 화면 안에 보이는 「이전」 칩(눌리는 것) · 루틴 세트 번호 · 휴식 막대.
// 안내를 이미 봤으면 화면을 지켜보지 않는다(P3 리뷰).
import { useEffect, useRef } from "react";
import {
  clearCoachMarkTrigger,
  isCoachMarkSeen,
  useCoachMark,
  useCoachMarkTriggered,
} from "@/lib/coachMarks";
import { t } from "@/lib/i18n";
import { useSelectorPresent } from "@/lib/overlayPresence";
import { CoachMark } from "./ui/CoachMark";

// 눌리는 「이전」 칩 — 기록이 없거나 마친 세트는 disabled 라 빠진다(ValueChip)
const PREV_SELECTOR = '[data-testid="set-prev"]:not([disabled]), [data-testid="cardio-prev"]:not([disabled])';

/** (a) 운동 중 — 「이전」을 누르면 지난 값이 들어간다 */
export function PrevHint() {
  const when = useSelectorPresent(PREV_SELECTOR, !isCoachMarkSeen("prev"), true);
  const { open, dismiss } = useCoachMark("prev", when);
  return <CoachMark open={open} text={t("hint.prev")} onDismiss={dismiss} testId="hint-prev" />;
}

/** (c) 슈퍼셋 묶음을 처음 체크해 휴식이 걸렸을 때 — 휴식 막대 위에 · 그 휴식이 끝나면 버린다 */
export function LongDoneHint() {
  const fired = useCoachMarkTriggered("longDone");
  const resting = useSelectorPresent('[data-testid="rest-bar"]', fired);
  // 휴식 막대가 한 번 보였다가 사라지면 그 순간은 지났다 — 다음 다른 휴식에 뜨지 않게(P3 리뷰)
  const sawRest = useRef(false);
  useEffect(() => {
    if (!fired) {
      sawRest.current = false;
      return;
    }
    if (resting) sawRest.current = true;
    else if (sawRest.current) {
      sawRest.current = false;
      clearCoachMarkTrigger("longDone");
    }
  }, [fired, resting]);
  // 운동 화면을 떠나도 버린다
  useEffect(() => () => clearCoachMarkTrigger("longDone"), []);
  // 그 순간에만 맞는 안내라 「이전」 안내가 쥔 차례를 넘겨받는다
  const { open, dismiss } = useCoachMark("longDone", fired && resting, true);
  return <CoachMark open={open} text={t("hint.longDone")} onDismiss={dismiss} testId="hint-long-done" />;
}

/** (b) 루틴 편집 — 세트 번호를 누르면 종류 바꾸기·복사·삭제 */
export function RxTypeHint() {
  const when = useSelectorPresent('[data-testid="rx-type"]', !isCoachMarkSeen("rxType"), true);
  const { open, dismiss } = useCoachMark("rxType", when);
  return <CoachMark open={open} text={t("hint.rxType")} onDismiss={dismiss} testId="hint-rx-type" />;
}
