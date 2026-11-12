// 이달의 리프터 쿠폰(SPEC-063) — 본인 수상만
import AwardCouponClient from "../../components/awards/AwardCouponClient";

export const metadata = { title: "내 상" };
export const dynamic = "force-dynamic";

export default async function AwardCouponPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AwardCouponClient id={decodeURIComponent(id)} />;
}
