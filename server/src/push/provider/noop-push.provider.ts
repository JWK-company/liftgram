import { Injectable } from '@nestjs/common';
import type { PushProvider, PushSendResult } from './push-provider';

// 기본 프로바이더 — 실제 발송 없음(개발/로컬). 실제 발송은 Expo/FCM/WebPush 어댑터로 교체.
@Injectable()
export class NoopPushProvider implements PushProvider {
  readonly name = 'noop';
  async send(): Promise<PushSendResult> {
    return { sent: 0, invalidTokens: [] };
  }
}
