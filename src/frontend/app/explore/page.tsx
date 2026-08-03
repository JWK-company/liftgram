// @plm SRS-018  발견(Explore)
import { UserSettingsProvider } from "../components/UserSettingsProvider";
import ExploreClient from "../components/feed/ExploreClient";

export const dynamic = "force-dynamic";

export default function ExplorePage() {
  return (
    // 인기 글 카드가 볼륨·무게를 그린다.
    <UserSettingsProvider>
      <ExploreClient />
    </UserSettingsProvider>
  );
}
