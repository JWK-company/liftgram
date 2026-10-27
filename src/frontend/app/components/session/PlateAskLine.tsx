"use client";
// @plm SRS-084 SRS-058  「원판 한쪽 무게로 적나요?」 한 줄(피드백 #63)
//
// 플레이트 후보 머신에서 그 종목의 입력 방식을 아직 안 정했을 때만, 세트 표 바로 아래에 조용히 한 번 묻는다.
// 시트·모달이 아니다 — 운동 흐름을 막지 않는다. 기본(한쪽)이 이미 적용돼 있어 답하지 않아도 볼륨은 맞고,
// 답하지 않고 완료하면 기본이 답으로 기억된다(settleUndecidedPlateOneSide).
// 화면 정리 규칙: 회색 글자 · 빨강 없음(선택 표시는 체크 아이콘 + 진한 글자 · /qa spec L-2) · 누르는 자리 44px.
import { t } from "@/lib/i18n";
import { Icon } from "../ui/Icon";

export function PlateAskLine({ onAnswer }: { onAnswer: (oneSide: boolean) => void }) {
  const opt = (oneSide: boolean) => {
    const selected = oneSide; // 기본 = 한쪽(아직 답하지 않은 상태가 곧 한쪽)
    return (
      <button
        type="button"
        data-testid={oneSide ? "plate-ask-one" : "plate-ask-both"}
        aria-pressed={selected}
        onClick={() => onAnswer(oneSide)}
        className={`inline-flex min-h-[44px] shrink-0 items-center gap-[3px] px-[6px] ${
          selected ? "font-semibold text-(--color-ink)" : "text-(--color-ink2)"
        }`}
      >
        {selected ? <Icon name="checkmark-circle" size={14} color="var(--color-ink2)" /> : null}
        {oneSide ? t("session.plateAskOne") : t("session.plateAskBoth")}
      </button>
    );
  };
  return (
    <fieldset
      data-testid="plate-ask"
      aria-label={t("session.plateAsk")}
      className="m-0 mt-[2px] flex min-w-0 border-0 flex-wrap items-center gap-x-[2px] rounded-[var(--radius-md)] bg-(--color-surface-alt) px-[var(--spacing-sm)] text-[length:var(--text-sm)] text-(--color-ink2)"
    >
      <span className="mr-auto min-w-0 py-[6px]">
        <span className="block">{t("session.plateAsk")}</span>
        <span className="block text-[length:var(--text-xs)] text-(--color-ink3)">
          {t("session.plateAskHint")}
        </span>
      </span>
      {opt(true)}
      <span aria-hidden className="text-(--color-ink3)">
        ·
      </span>
      {opt(false)}
    </fieldset>
  );
}
