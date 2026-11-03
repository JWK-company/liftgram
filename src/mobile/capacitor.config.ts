// @plm SRS-095 [ADR-046]  스토어 앱 껍데기 설정
// 리프트그램 스토어 앱 — 화면은 **웹앱(liftgram.tarae.org)을 그대로** 불러온다(server.url · 스펙 §3 방식 A).
// 화면을 고치면 서버 배포만으로 앱도 바뀌고, 이 디렉터리(네이티브)를 고칠 때만 스토어 심사를 다시 받는다.
// 오프라인 첫 실행은 웹앱의 서비스 워커가 맡는다(ADR-032) — iOS 는 App-Bound Domains(Info.plist WKAppBoundDomains)가 있어야 돈다.
// appId 는 liftgram.tarae.org 역순 — 스토어에 한 번 올리면 못 바꾼다(사용자 확정 2026-11-03).
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "org.tarae.liftgram",
  appName: "리프트그램",
  // 서버에 한 번도 못 닿았을 때(설치 직후 오프라인) 보일 화면만 앱에 싣는다.
  webDir: "www",
  // 웹이 「앱 안」인지 알아보는 표식 — frontend lib/platform.ts 가 로그인·잠금화면·위젯 길을 가른다.
  appendUserAgent: "LiftgramApp/1.0",
  server: {
    url: "https://liftgram.tarae.org",
    // 원격 화면이 안 열리면 앱에 실린 이 파일로 간다 — 빈 화면은 심사 반려 사유다.
    errorPath: "offline.html",
    // 앱 안에서 열어도 되는 곳 — 그 밖(소셜 로그인 제공자 등)은 시스템 브라우저로 나간다.
    allowNavigation: ["liftgram.tarae.org"],
  },
  // iOS 는 표식에 「(ios)」를 덧붙인다 — 서버가 요청 시점에 아이폰 앱을 알아 Apple 로그인 버튼을 보인다(심사 4.8).
  ios: { appendUserAgent: "LiftgramApp/1.0 (ios)", limitsNavigationsToAppBoundDomains: true },
  // SPEC-018 · P2 보안 M-2 — 새 브리지(WebMessageListener)만. 옛 브리지는 iframe 의 호출을 가리지 못한다.
  // 업데이트 플러그인은 옛 브리지면 모든 호출을 origin 으로 거절한다(LiftgramUpdatePlugin.guarded).
  android: { useLegacyBridge: false },
  plugins: {
    // [원본] SplashScreen: { launchShowDuration: 0 }, // 웹앱이 자기 스플래시를 그린다
    //   → 네이티브 스플래시가 바로 내려가 원격 화면이 뜰 때까지 빈 웹뷰가 보였다.
    // [개선] 시작 화면 한 장면(SPEC-017 Phase 1): 네이티브 빈 로고 윤곽 → 같은 자리에서 웹 부팅 덮개가 로고를 채운다.
    //   웹이 덮개를 그리면 곧바로 SplashScreen.hide() 를 부른다(src/frontend/app/layout.tsx APP_BOOT_HIDE).
    //   autoHide + 6초 = **상한** — 원격이 느리거나 웹이 hide 를 못 불러도 6초 뒤 내려간다(플러그인이 거는 타이머).
    SplashScreen: { launchAutoHide: true, launchShowDuration: 6000, launchFadeOutDuration: 0 },
  },
};

export default config;
