"use client";
// 공용 광고 슬롯 — 광고는 이 컴포넌트 하나로만 그린다(SPEC-022 · ADR-050 · SRS-098).
//
// 지금은 실광고가 없어 기본 상태에서 요소를 그리지 않는다(여백도 남기지 않는다).
// 관리자가 운영 웹의 링크로 미리 보기를 켜면 자리를 점선 칸으로 보여 준다.
// 미리 보기도 실광고도 adGuard 를 거친다 — 운동 중이거나 운동 상태를 모르면 비운다.
// 실광고를 붙일 때: 이 파일에 앱 전용 분기와 빈도 규칙을 더한다. AdMob 배너는 화면 위 네이티브 층이라
// 이 자리에 그대로 들어가지 않을 수 있다(SPEC-022 위험).
import { Role } from "@app/contracts";
import { adGuard, type AdPlacement } from "@app/core/domain/adPolicy";
import { useEffect, useState } from "react";
import { adPreviewOn } from "@/lib/adPreview";
import { t } from "@/lib/i18n";
import { useAuth } from "../AuthProvider";
import { useSession } from "../SessionProvider";

export function AdSlot({ placement, className = "" }: { placement: AdPlacement; className?: string }) {
  const { activeKnown, activeWorkoutId } = useSession();
  const { user } = useAuth();
  // 저장 값은 그림 뒤에 읽는다 — 서버 그림과 어긋나지 않게
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    setPreview(adPreviewOn());
  }, []);

  if (!adGuard({ activeKnown, activeWorkoutId })) return null;
  if (!preview || user?.role !== Role.ADMIN) return null;

  return (
    <aside
      data-ad-slot={placement}
      data-testid={`ad-slot-${placement}`}
      aria-label={t("ads.label")}
      // 큰 배너(320×100) 크기로 위치를 본다 · 위아래를 띄워 버튼과 붙지 않게 한다
      // [원본] className={`… rounded-[var(--radius-md)] border border-(--color-line) border-dashed … ${className}`} — 화면 안 점선 상자
      // [개선] 평평한 기록지(SPEC-056 F1) — 상자를 걷고 위·아래 점선으로 자리만 · 「광고」 는 테두리 꼬리표로 남겨 글과 구분이 분명하게
      className={`mx-auto my-[var(--spacing-xl)] flex h-[100px] w-full max-w-[320px] flex-col items-center justify-center gap-[4px] border-(--color-line-strong) border-y border-dashed text-(--color-ink3) text-[length:var(--text-sm)] ${className}`}
    >
      {/* [원본] <span className="font-semibold">{t("ads.label")}</span> */}
      {/* 법적 표시라 작게 줄이지 않는다 — 11px → 본문 작은 글자(--text-sm · P5 리뷰 M-2) */}
      <span className="rounded-[var(--radius-sm)] border border-(--color-ink3) px-[6px] py-[1px] font-semibold text-(--color-ink2) text-[length:var(--text-sm)]">
        {t("ads.label")}
      </span>
      <span>{t("ads.previewHint")}</span>
    </aside>
  );
}
