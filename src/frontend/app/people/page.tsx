// 사람 — 피드 머리 👤(SPEC-048 · S-18): 이름 찾기 + 팔로잉·팔로워
import { Suspense } from "react";
import PeopleClient from "../components/feed/PeopleClient";

export const dynamic = "force-dynamic";

export default function PeoplePage() {
  return (
    <Suspense>
      <PeopleClient />
    </Suspense>
  );
}
