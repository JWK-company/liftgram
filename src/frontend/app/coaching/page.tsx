// @plm SRS-048  코칭 — 관계도 기록도 계정에 달렸다. 서버가 미리 정할 것이 없다.
import CoachingClient from "../components/coaching/CoachingClient";

export const metadata = { title: "코칭" };

export default function Page() {
  return <CoachingClient />;
}
