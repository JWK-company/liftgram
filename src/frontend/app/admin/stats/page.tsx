// 통계(SPEC-032) — 관리자 전용. 경계는 서버이고, 화면은 관리자가 아니면 부르지 않는다.
import StatsClient from "../../components/admin/StatsClient";

export const metadata = { title: "통계" };

export default function Page() {
  return <StatsClient />;
}
