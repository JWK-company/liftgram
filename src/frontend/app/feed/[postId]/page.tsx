// @plm SRS-007  댓글
import CommentsClient from "../../components/feed/CommentsClient";

export const dynamic = "force-dynamic";

export default async function CommentsPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  return <CommentsClient postId={decodeURIComponent(postId)} />;
}
