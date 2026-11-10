// 영상·글로 루틴 가져오기(SPEC-054 · SRS-116) — 링크·설명란·스크립트 복사본 → 규칙 해석 초안 → 확인 → 내 루틴
// 2026-11-10 앱에서 뗌(정확도·편의 미달 · ADR-064 보류) — 주소는 404. 다시 붙이면 [원본] 두 줄을 살리고 notFound 를 지운다
// [원본] import RoutineImportScreen from "../../components/routines/RoutineImportScreen";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default function RoutineImportPage() {
  // [원본] return <RoutineImportScreen />;
  // [개선] 앱에서 뗌 — 404(ADR-064)
  notFound();
}
