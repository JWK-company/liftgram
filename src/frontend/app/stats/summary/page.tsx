// [원본] @plm SRS-079 SRS-080  기간 성과 요약 — 기간 고르기 · 미리보기 · 코치에게 보내기
// [원본] import ProgressSummaryClient from "../../components/summary/ProgressSummaryClient";
// [원본] export const dynamic = "force-dynamic";
// [원본] export default function ProgressSummaryPage() {
// [원본]   return <ProgressSummaryClient />;
// [원본] }
// [개선] 심화 분석은 분석 탭 한 페이지에 둔다(ADR-051). 옛 주소로 들어오면 분석 탭으로 넘긴다.
import { redirect } from "next/navigation";

export default function ProgressSummaryPage(): never {
  redirect("/stats");
}
