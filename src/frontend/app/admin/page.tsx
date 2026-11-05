// 운영자 페이지 — 운영진 전용 기능을 모은 첫 화면. 프로필에서 들어온다(SPEC-032).
import AdminClient from "../components/admin/AdminClient";

export const metadata = { title: "운영자 페이지" };

export default function Page() {
  return <AdminClient />;
}
