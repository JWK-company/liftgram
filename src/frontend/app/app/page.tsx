// SPEC-018 §8  공개 앱 안내 /app — 로그인 없이. 최신 버전·크기·서명 지문 전체 · 받기 · 설치 순서 · 인앱 브라우저면 크롬으로 열기.
// 옛 앱(디버그 키) 재설치와 PWA 바꾸기의 fallback(intent S.browser_fallback_url)이 여기로 온다. 서비스 워커는 이 경로를 가로채지 않는다.
import AppPageClient from "./AppPageClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "리프트그램 안드로이드 앱" };

export default function AppPage() {
  return <AppPageClient />;
}
