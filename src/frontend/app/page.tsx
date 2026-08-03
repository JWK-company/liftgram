// @plm SRS-003  운동 탭 — 앱을 열면 처음 보이는 화면
//
// app의 첫 화면도 이것이다(Tabs → WorkoutTab). 종목 카탈로그는 탭이 아니라
// 세션·루틴 편집기의 종목 고르기로 들어가는 화면이라 `/exercises`에 둔다.
//
// 목록도 오늘의 안내도 **로컬 저장소**에서 온다(ADR-002). 서버가 미리 그릴 수 없어
// 껍데기만 서버 컴포넌트로 두고 내용은 클라이언트가 만든다.
import RoutinesClient from "./components/routines/RoutinesClient";
import { UserSettingsProvider } from "./components/UserSettingsProvider";

export const dynamic = "force-dynamic";

export default function RoutinesPage() {
  return (
    // 주간 스케줄은 사용자 설정에 들어 있다 — 그래서 이 화면도 설정 컨텍스트가 필요하다.
    <UserSettingsProvider>
      <RoutinesClient />
    </UserSettingsProvider>
  );
}
