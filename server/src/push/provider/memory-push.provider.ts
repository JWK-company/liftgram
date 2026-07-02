import { Injectable } from '@nestjs/common';
import type { PushMessage, PushProvider, PushSendResult, PushTarget } from './push-provider';

// 테스트용 프로바이더 (config PUSH_PROVIDER=memory) — 발송을 인메모리 아웃박스에 캡처.
export interface CapturedPush {
  token: string;
  message: PushMessage;
}
const OUTBOX: CapturedPush[] = [];

// 주어진 토큰들로 캡처된 푸시를 반환하고 비운다(테스트 조회용).
export function drainOutbox(tokens: string[]): CapturedPush[] {
  const set = new Set(tokens);
  const mine = OUTBOX.filter((p) => set.has(p.token));
  for (let i = OUTBOX.length - 1; i >= 0; i--) {
    if (set.has(OUTBOX[i].token)) OUTBOX.splice(i, 1);
  }
  return mine;
}

@Injectable()
export class MemoryPushProvider implements PushProvider {
  readonly name = 'memory';
  async send(targets: PushTarget[], message: PushMessage): Promise<PushSendResult> {
    for (const t of targets) OUTBOX.push({ token: t.token, message });
    return { sent: targets.length, invalidTokens: [] };
  }
}
