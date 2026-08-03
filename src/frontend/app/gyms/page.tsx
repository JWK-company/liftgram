// @plm SRS-035  주변 헬스장 — 위치를 물어야 시작하므로 서버가 미리 정할 것이 없다.
import NearbyGymsClient from "../components/NearbyGymsClient";

export const metadata = { title: "주변 헬스장" };

export default function Page() {
  return <NearbyGymsClient />;
}
