// @plm SRS-018  해시태그 모아보기
import { UserSettingsProvider } from "../../components/UserSettingsProvider";
import HashtagClient from "../../components/feed/HashtagClient";

export const dynamic = "force-dynamic";

export default async function HashtagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  return (
    <UserSettingsProvider>
      <HashtagClient tag={decodeURIComponent(tag).toLowerCase()} />
    </UserSettingsProvider>
  );
}
