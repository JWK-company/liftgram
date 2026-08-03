// @plm SRS-042  내 장비함 — 로컬 우선이라 비로그인·오프라인에서도 열린다
import MyGearClient from "../components/profile/MyGearClient";
import { UserSettingsProvider } from "../components/UserSettingsProvider";

export const dynamic = "force-dynamic";

export default function GearPage() {
  return (
    <UserSettingsProvider>
      <MyGearClient />
    </UserSettingsProvider>
  );
}
