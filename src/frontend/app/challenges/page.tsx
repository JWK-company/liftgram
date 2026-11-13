// 그룹 챌린지(SPEC-064) — 내 챌린지 목록 · 새 챌린지
import ChallengesClient from "../components/challenge/ChallengesClient";

export const metadata = { title: "그룹 챌린지" };
export const dynamic = "force-dynamic";

export default function ChallengesPage() {
  return <ChallengesClient />;
}
