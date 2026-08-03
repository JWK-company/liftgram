// @plm SRS-008  팔로워·팔로잉 목록
import FollowListClient from "../../../components/feed/FollowListClient";

export const dynamic = "force-dynamic";

export default async function FollowsPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const [{ userId }, { mode }] = await Promise.all([params, searchParams]);
  // 알 수 없는 값은 팔로워로 — 주소를 손으로 고쳐도 화면이 깨지지 않는다.
  return (
    <FollowListClient
      userId={decodeURIComponent(userId)}
      mode={mode === "following" ? "following" : "followers"}
    />
  );
}
