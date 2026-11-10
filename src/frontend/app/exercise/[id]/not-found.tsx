// 화면 지도 #T17 — 없는 종목 링크(지워짐·합쳐짐·오타). 루트 404 와 같은 모양에 종목 문구 · 주 버튼은 종목 목록.
// 상태 코드는 page/generateMetadata 의 notFound() 가 404 로 낸다(이 폴더 위에 loading.tsx 를 두지 말 것 — page.tsx 주석).
import { NotFoundView } from "../../components/notfound/NotFoundView";

export default function ExerciseNotFound() {
  return (
    <NotFoundView
      title="notFound.exerciseTitle"
      message="notFound.exerciseMessage"
      primaryHref="/exercises"
      primaryLabel="notFound.exercises"
    />
  );
}
