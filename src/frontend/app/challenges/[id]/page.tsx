// 그룹 챌린지 상세(SPEC-064) — 규칙 · 초대 · 출석표 · 벌칙
import ChallengeDetailClient from "../../components/challenge/ChallengeDetailClient";

export const metadata = { title: "그룹 챌린지" };
export const dynamic = "force-dynamic";

export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChallengeDetailClient id={safeDecode(id)} />;
}

/** 깨진 퍼센트 인코딩(%E0 등)이면 원문 그대로 — URIError 로 500 이 나지 않게(REV-161 L-13) */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
