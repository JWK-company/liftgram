"use client";
// 설정 「안내 다시 보기」(SPEC-046 · SRS-111 R5) — 첫 안내 세 개(이전 칩 · 세트 번호 · 길게 눌러 이 종목만)를 다시 띄운다.
// ProfileClient 에는 이 줄을 끼우는 한 줄만 둔다(병렬 세션과 겹치는 파일 · 최소 diff).
import { resetCoachMarks } from "@/lib/coachMarks";
import { t } from "@/lib/i18n";
import { useToast } from "../Toast";
import { ListRow } from "../ui/rows";

export function HintsResetRow() {
  const toast = useToast();
  return (
    <ListRow
      testId="row-hints-reset"
      icon="help-circle-outline"
      title={t("hint.resetTitle")}
      subtitle={t("hint.resetCaption")}
      wrapSubtitle
      onPress={() => {
        resetCoachMarks();
        toast(t("hint.resetDone"));
      }}
    />
  );
}
