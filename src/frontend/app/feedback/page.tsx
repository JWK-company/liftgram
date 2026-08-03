// @plm SRS-006  개발 피드백 탭 — 내부 사람 전용
//
// 서버 컴포넌트로 확정할 것이 없다(권한도 목록도 세션에 달렸다) — 껍데기만 두고 화면이 판단한다.
import FeedbackClient from "../components/FeedbackClient";

export const metadata = { title: "개발 피드백" };

export default function Page() {
  return <FeedbackClient />;
}
