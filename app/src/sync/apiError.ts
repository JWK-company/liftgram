// 서버 요청 예외 → 사용자 친화 메시지 키 매핑. request()는 `${status} ${text}`로 throw하고,
// 타임아웃은 AbortError, 네트워크 단절은 TypeError로 온다.
import type { TransKey } from '../i18n';

export function authErrorKey(e: unknown): TransKey {
  const name = e instanceof Error ? e.name : '';
  const msg = e instanceof Error ? e.message : String(e);
  if (name === 'AbortError') return 'auth.errTimeout';
  if (name === 'TypeError' || /network|failed to fetch|load failed/i.test(msg)) return 'auth.errNetwork';
  if (msg.startsWith('401') || msg.startsWith('400')) return 'auth.errInvalid';
  if (msg.startsWith('409')) return 'auth.errExists';
  if (/^5\d\d/.test(msg)) return 'auth.errServer';
  return 'auth.errNetwork';
}
