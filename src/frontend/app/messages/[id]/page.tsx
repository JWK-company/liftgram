// @plm SRS-017  대화방
import ConversationClient from "../../components/dm/ConversationClient";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConversationClient conversationId={decodeURIComponent(id)} />;
}
