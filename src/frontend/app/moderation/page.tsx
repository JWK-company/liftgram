// @plm SRS-020  모더레이션 큐
import ModerationQueueClient from "../components/moderation/ModerationQueueClient";

export const dynamic = "force-dynamic";

export default function ModerationPage() {
  return <ModerationQueueClient />;
}
