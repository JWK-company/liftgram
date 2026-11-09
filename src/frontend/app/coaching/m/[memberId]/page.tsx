// 코칭 회원 화면(SPEC-050 P2) — 코치가 담당 회원의 기록·분석·루틴을 본다(읽기 전용 · 메모리만).
// 구조는 /u/[userId] 와 같다: 서버는 주소의 id·탭만 넘기고, 내용은 클라이언트가 동의 범위 안에서 읽는다.
import { t } from "@/lib/i18n";
import MemberClient, { type MemberTab } from "../../../components/coaching/MemberClient";

export const dynamic = "force-dynamic";
// [원본] export const metadata = { title: "회원 기록" };
// [개선] 제목도 사전에서 — /coaching/join 과 같은 관례(코드 리뷰 L-6)
export const metadata = { title: t("coaching.member.title") };

const TABS: readonly MemberTab[] = ["records", "stats", "routines"];

export default async function CoachingMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { memberId } = await params;
  const { tab } = await searchParams;
  const want = Array.isArray(tab) ? tab[0] : tab;
  const initialTab = TABS.find((x) => x === want) ?? "records";
  return <MemberClient memberId={decodeURIComponent(memberId)} initialTab={initialTab} />;
}
