// @plm SRS-006  프로필 탭 — 단위·언어·바 무게·체중·가용 기구·머신 라벨·휴식 알림음
import ProfileClient from "../components/profile/ProfileClient";
import { UserSettingsProvider } from "../components/UserSettingsProvider";

export const dynamic = "force-dynamic";

export default function ProfilePage() {
  return (
    // 이 화면은 통째로 사용자 설정을 읽고 쓴다.
    <UserSettingsProvider>
      <ProfileClient />
    </UserSettingsProvider>
  );
}
