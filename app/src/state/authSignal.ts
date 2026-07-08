// 경량 인증 변경 브로드캐스터. 로그인/가입/로그아웃 시 발화되어, 역할 기반 UI(예: 개발
// 피드백 탭 가시성)가 앱 재시작 없이 즉시 재평가되도록 한다. 네이티브 의존 없는 순수 모듈.
type Listener = () => void;

const listeners = new Set<Listener>();

export function onAuthChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitAuthChange(): void {
  for (const l of [...listeners]) {
    try {
      l();
    } catch {
      // 구독자 예외는 다른 구독자에 영향 주지 않게 격리.
    }
  }
}
