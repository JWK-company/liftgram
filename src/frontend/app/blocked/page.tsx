// @plm SRS-020  차단 목록
import BlockedUsersClient from "../components/moderation/BlockedUsersClient";

export const dynamic = "force-dynamic";

export default function BlockedPage() {
  return <BlockedUsersClient />;
}
