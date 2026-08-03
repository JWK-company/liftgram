// @plm SRS-007  피드 탭
import { UserSettingsProvider } from "../components/UserSettingsProvider";
import FeedClient from "../components/feed/FeedClient";

export const dynamic = "force-dynamic";

export default function FeedPage() {
  return (
    // 오운완 카드의 볼륨·무게 표기에 단위가 필요하다.
    <UserSettingsProvider>
      <FeedClient />
    </UserSettingsProvider>
  );
}
