// @plm SRS-004  운동 세션 화면 — 기록은 전부 로컬에서 일어난다 (ADR-002)
//
// 세션은 서버가 그려 줄 수 없다. 진행 중인 운동은 **기기의 로컬 저장소**에만 있고, 헬스장에서
// 네트워크 없이 기록되는 것이 이 화면의 존재 이유이기 때문이다(SRS-006).
// 그래서 서버 컴포넌트는 껍데기만 두고 내용은 전부 클라이언트가 만든다.
import { UserSettingsProvider } from "../components/UserSettingsProvider";
import ActiveWorkout from "../components/session/ActiveWorkout";

export const dynamic = "force-dynamic";

export default function WorkoutPage() {
  return (
    <>
      {/* 세션은 자기 헤더(경과 시간·이름·완료)를 갖는다 — app도 이 화면만 헤더를 감춘다. */}
      {/* 설정(단위·바 무게·체중)과 전역 휴식 타이머는 브라우저에서만 켜진다. */}
      <UserSettingsProvider>
        <ActiveWorkout />
      </UserSettingsProvider>
    </>
  );
}
