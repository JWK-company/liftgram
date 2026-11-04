// 운영 탭 — 운영진 전용 기능을 모은 첫 화면(피드백 · 모더레이션 큐 · 운영 상태)
import StaffClient from "../components/staff/StaffClient";

export const metadata = { title: "운영" };

export default function Page() {
  return <StaffClient />;
}
