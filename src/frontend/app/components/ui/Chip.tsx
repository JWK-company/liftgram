// @plm SRS-001  토글 칩 — app의 features/exercises/Chip.tsx를 웹으로 옮긴 것
//
// 필터(부위·기구)와 폼의 다중/단일 선택에 공용으로 쓴다.
// [원본] 활성이면 브랜드 채움 + 볼드, 비활성이면 surfaceAlt 배경 + 테두리 — app과 같은 두 상태다.
// [개선] 고르는 칩 하나의 꼴(QuietChip · SPEC-057 R1b · REV-129) — 이름·props 는 그대로 두고 꼴만 넘긴다.
"use client";

import { QuietChip } from "./quiet";

/* [원본] 브랜드 채움 Chip 본문 — 커밋 a35b535 의 이 파일(SPEC-057 Phase 1 에서 QuietChip 으로 넘김) */
export function Chip({
  label,
  active,
  onPress,
  testId,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testId?: string;
}) {
  return <QuietChip label={label} active={active} onPress={onPress} testId={testId} nowrap />;
}
