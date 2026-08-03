"use client";
// @plm SRS-046  RIR·웜업 마이크로 교육 — app의 features/session/SessionGuides.tsx를 웹으로
//
// 세션 안에서 바로 열어 보는 짧은 가이드다. RIR("몇 개 더 할 수 있었나")은 트레이너와 회원이
// 같은 말을 쓰기 위한 공통 언어라 세션 화면에 두었다(BS-004).
//
// 문구는 전부 i18n의 `guide.*`에서 온다 — 여기 본문을 적지 않는다(카피 게이트가 그쪽을 검사한다).
import { useState } from "react";
import { t, type TransKey } from "@/lib/i18n";
import { Button } from "../ui/Button";
import { SheetShell } from "../ui/Dialog";
import { AppText } from "../ui/primitives";

const RIR_PAGES = ["p1", "p2", "p3", "p4"] as const;
const WARMUP_PAGES = ["p1", "p2", "p3"] as const;

export function SessionGuideButtons() {
  const [open, setOpen] = useState<"rir" | "warmup" | null>(null);

  return (
    <div className="flex gap-[var(--spacing-sm)] pt-[var(--spacing-sm)]">
      <GuideButton label={t("guide.rir.button")} onPress={() => setOpen("rir")} testId="btn-guide-rir" />
      <GuideButton
        label={t("guide.warmup.button")}
        onPress={() => setOpen("warmup")}
        testId="btn-guide-warmup"
      />

      {open === "rir" ? (
        <GuideModal
          titleKey="guide.rir.title"
          pageKeys={RIR_PAGES.map((p) => `guide.rir.${p}`)}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {open === "warmup" ? (
        <GuideModal
          titleKey="guide.warmup.title"
          pageKeys={WARMUP_PAGES.map((p) => `guide.warmup.${p}`)}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}

function GuideButton({ label, onPress, testId }: { label: string; onPress: () => void; testId: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onPress}
      className="flex-1 rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-surface) py-[4px] text-center"
    >
      <AppText variant="caption" className="font-semibold">
        {label}
      </AppText>
    </button>
  );
}

/** 여러 쪽짜리 가이드 — 도트로 위치를 보여 주고 이전/다음으로 넘긴다. */
function GuideModal({
  titleKey,
  pageKeys,
  onClose,
}: {
  titleKey: TransKey;
  pageKeys: string[];
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const last = page >= pageKeys.length - 1;

  return (
    <SheetShellNoOk onClose={onClose}>
      <AppText variant="label" color="primary">
        {t(titleKey)}
      </AppText>
      <AppText variant="heading" className="mt-[2px] block">
        {t(`${pageKeys[page]}.title` as TransKey)}
      </AppText>
      <div className="mt-[var(--spacing-sm)] max-h-[300px] overflow-y-auto">
        <AppText variant="body" color="textMuted">
          {t(`${pageKeys[page]}.body` as TransKey)}
        </AppText>
      </div>

      <div className="mt-[var(--spacing-md)] flex justify-center gap-[6px]">
        {pageKeys.map((k, i) => (
          <span
            key={k}
            style={{ backgroundColor: i === page ? "var(--color-brand)" : "var(--color-line)" }}
            className="h-[6px] w-[6px] rounded-full"
          />
        ))}
      </div>

      <div className="mt-[var(--spacing-md)] flex gap-[var(--spacing-sm)]">
        <div className="flex-1">
          <Button
            title={t("guide.prev")}
            variant="secondary"
            disabled={page === 0}
            onPress={() => setPage((p) => Math.max(0, p - 1))}
          />
        </div>
        <div className="flex-1">
          <Button
            title={last ? t("common.ok") : t("guide.next")}
            onPress={() => (last ? onClose() : setPage((p) => p + 1))}
          />
        </div>
      </div>
    </SheetShellNoOk>
  );
}

/** 가이드는 자체 버튼(이전/다음)을 가지므로 확인 버튼이 붙지 않은 껍데기를 쓴다. */
function SheetShellNoOk({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <SheetShell title="" onClose={onClose} hideOk testId="guide-modal">
      {children}
    </SheetShell>
  );
}
