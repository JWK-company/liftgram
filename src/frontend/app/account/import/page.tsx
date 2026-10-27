// @plm SRS-081 SRS-082  다른 앱 기록 가져오기 — 전체 화면(계정 → 기기와 서버 → 다른 앱 기록 가져오기)
//
// 단계가 길고(종목 맞추기 수십 줄) 도중에 나가면 고른 것이 사라지므로 카드 안이 아니라 화면 하나로 연다(U-18).
// 기록은 전부 이 기기의 로컬 저장소에 쓴다 — 서버 컴포넌트는 껍데기만 둔다.
import ImportFlow from "../../components/sync/ImportFlow";

export const dynamic = "force-dynamic";

export default function AccountImportPage() {
  return <ImportFlow />;
}
