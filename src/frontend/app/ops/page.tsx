// @plm SRS-088  운영 상태(admin) — 동기가 멈춘 사용자 · 백업 결과 · 사용자 목록
import OpsClient from "../components/ops/OpsClient";

export const dynamic = "force-dynamic";

export default function OpsPage() {
  return <OpsClient />;
}
