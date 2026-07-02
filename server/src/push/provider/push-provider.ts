// 푸시 발송 어댑터 포트 (SRS-020 · ADR-015). 기본 noop — Expo/FCM/WebPush 드롭인.
export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}
export interface PushTarget {
  token: string;
  platform: string;
}
export interface PushSendResult {
  sent: number;
  invalidTokens: string[]; // 등록 해제된/무효 토큰 → 정리 대상
}
export interface PushProvider {
  readonly name: string;
  send(targets: PushTarget[], message: PushMessage): Promise<PushSendResult>;
}
export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');
