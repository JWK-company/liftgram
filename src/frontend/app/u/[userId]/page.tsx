// @plm SRS-008  공개 프로필
import { UserSettingsProvider } from "../../components/UserSettingsProvider";
import UserProfileClient from "../../components/feed/UserProfileClient";

export const dynamic = "force-dynamic";

export default async function UserProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return (
    <UserSettingsProvider>
      <UserProfileClient userId={decodeURIComponent(userId)} />
    </UserSettingsProvider>
  );
}
