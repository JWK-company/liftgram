"use client";
// 탭 머리 ? 버튼(SPEC-058) — 누르면 그 탭의 사용법 안내(GuideOverlay).
// 앱바 아이콘과 같은 44px 원형 아이콘 버튼(SPEC-057 R3) · 안 본 탭이면 강조색 점(R3 점) · 자동으로 띄우지 않는다(id=1831).
import { useState } from "react";
import { type GuideTab, useGuideUnseen } from "@/lib/tabGuide";
import { AppBarAction } from "../ui/AppBar";
import { GuideOverlay } from "./GuideOverlay";

export function GuideButton({ tab }: { tab: GuideTab }) {
  const [open, setOpen] = useState(false);
  const [unseen, markSeen] = useGuideUnseen(tab);
  const testId = `guide-${tab}`;
  return (
    <>
      <AppBarAction
        icon="help-circle-outline"
        label="이 탭 사용법"
        testId={testId}
        badge={unseen}
        onPress={() => {
          markSeen();
          setOpen(true);
        }}
      />
      {open ? (
        <GuideOverlay
          tab={tab}
          onClose={() => {
            setOpen(false);
            // 초점을 ? 로 돌려준다(REV-140 2)
            requestAnimationFrame(() =>
              document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.focus(),
            );
          }}
        />
      ) : null}
    </>
  );
}
