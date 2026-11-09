// 코칭 초대 링크(SPEC-050 P1b) — /coaching/join?code=XXXXXXXX
// 코치 카드(이름·코치 배지·소개·태그) + 범위 시트 → 연결 → /coaching. 로그인 전이면 코드를 들고 로그인으로 갔다가 돌아온다.
import { t } from "@/lib/i18n";
import JoinClient from "../../components/coaching/JoinClient";

export const dynamic = "force-dynamic";
// 제목도 사전에서(코드 리뷰 지적 10) — 서버 컴포넌트지만 lib/i18n 은 언어 고정(ko) 순수 함수라 그대로 부른다(layout.tsx 의 tw 와 같다)
export const metadata = { title: t("coaching.join.title") };

export default async function Page({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return <JoinClient code={typeof code === "string" ? code : ""} />;
}
