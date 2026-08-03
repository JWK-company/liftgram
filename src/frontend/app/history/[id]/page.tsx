// @plm SRS-005  세션 상세 — 지난 운동 하나를 펼쳐 본다
import WorkoutDetailClient from "../../components/analytics/WorkoutDetailClient";

export const dynamic = "force-dynamic";

export default async function WorkoutDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkoutDetailClient workoutId={id} />;
}
