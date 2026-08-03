// @plm SRS-017  대화 목록
import ConversationsClient from "../components/dm/ConversationsClient";

export const dynamic = "force-dynamic";

export default function MessagesPage() {
  return <ConversationsClient />;
}
