// 기간 성과 요약 화면(ProgressSummaryClient)은 2026-11-09 지웠다 — 되살리려면 git 기록(커밋 e288d7b 판)에서 가져온다.
// [개선] 심화 분석은 분석 탭 한 페이지에 둔다(ADR-051). 옛 주소로 들어오면 분석 탭으로 넘긴다.
import { redirect } from "next/navigation";

export default function ProgressSummaryPage(): never {
  redirect("/stats");
}
