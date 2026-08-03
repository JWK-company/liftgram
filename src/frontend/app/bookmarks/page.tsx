// @plm SRS-007  저장한 게시물
import { UserSettingsProvider } from "../components/UserSettingsProvider";
import BookmarksClient from "../components/feed/BookmarksClient";

export const dynamic = "force-dynamic";

export default function BookmarksPage() {
  return (
    <UserSettingsProvider>
      <BookmarksClient />
    </UserSettingsProvider>
  );
}
