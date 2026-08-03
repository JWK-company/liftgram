// @plm SRS-006  계정 — 로그인·가입·로그아웃
//
// 이 화면은 **선택**이다. 기록은 계정 없이도 기기에 남고(ADR-002), 로그인은 서버 백업과
// 소셜 기능을 여는 것뿐이다. 그래서 탭이 아니라 프로필에서 들어가는 화면으로 둔다.
import AuthClient from "../components/profile/AuthClient";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  return <AuthClient />;
}
