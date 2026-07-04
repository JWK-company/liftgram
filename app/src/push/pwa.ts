// @plm SRS-006  PWA 부트스트랩(웹 전용) — 매니페스트/메타 주입 + SW 등록 + 설치 프롬프트.
// Expo 웹 index.html은 생성물이라 런타임에 head를 보강한다. 네이티브는 no-op.
import { Platform } from 'react-native';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => void;
  userChoice: Promise<{ outcome: string }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installListener: (() => void) | null = null;

function addLink(rel: string, href: string): void {
  if (document.head.querySelector(`link[rel="${rel}"]`)) return;
  const el = document.createElement('link');
  el.rel = rel;
  el.href = href;
  document.head.appendChild(el);
}

function addMeta(name: string, content: string): void {
  if (document.head.querySelector(`meta[name="${name}"]`)) return;
  const el = document.createElement('meta');
  el.name = name;
  el.content = content;
  document.head.appendChild(el);
}

function injectHead(): void {
  addLink('manifest', '/manifest.json');
  addLink('apple-touch-icon', '/apple-touch-icon.png');
  addMeta('theme-color', '#0E1116');
  addMeta('mobile-web-app-capable', 'yes');
  addMeta('apple-mobile-web-app-capable', 'yes');
  addMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
  addMeta('apple-mobile-web-app-title', 'Liftgram');
}

// 앱 시작 시 1회 호출(웹). 매니페스트/메타 주입 + SW 등록 + 설치 이벤트 캡처.
export function initPwa(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || typeof window === 'undefined') return;
  injectHead();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    installListener?.();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installListener?.();
  });
}

export function canInstall(): boolean {
  return deferredPrompt !== null;
}

// 설치 가능 상태 변화 구독(설치 버튼 노출용). 반환값으로 해제.
export function onInstallAvailable(cb: () => void): () => void {
  installListener = cb;
  return () => {
    if (installListener === cb) installListener = null;
  };
}

export async function promptInstall(): Promise<void> {
  const e = deferredPrompt;
  if (!e) return;
  e.prompt();
  try {
    await e.userChoice;
  } catch {
    // 무시
  }
  deferredPrompt = null;
  installListener?.();
}
