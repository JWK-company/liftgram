// 이달의 리프터(SPEC-063) — 월간 시상 · 수상자 · 내 상 · 규칙
import AwardsClient from "../components/awards/AwardsClient";

export const metadata = { title: "이달의 리프터" };
export const dynamic = "force-dynamic";

export default function AwardsPage() {
  return <AwardsClient />;
}
