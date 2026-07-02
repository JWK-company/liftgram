import { Injectable } from '@nestjs/common';
import type { PushMessage, PushProvider, PushSendResult, PushTarget } from './push-provider';
import { ExpoPushProvider } from './expo-push.provider';
import { WebPushProvider } from './web-push.provider';

// 플랫폼 라우팅 프로바이더 (기본). 각 하위 프로바이더가 자기 platform만 필터해 발송.
// expo 토큰 → Expo, web 구독 → WebPush. 미설정 플랫폼은 각 프로바이더가 no-op.
@Injectable()
export class CompositePushProvider implements PushProvider {
  readonly name = 'composite';
  constructor(
    private readonly expo: ExpoPushProvider,
    private readonly web: WebPushProvider,
  ) {}

  async send(targets: PushTarget[], message: PushMessage): Promise<PushSendResult> {
    const results = await Promise.all([this.expo.send(targets, message), this.web.send(targets, message)]);
    return results.reduce<PushSendResult>(
      (acc, r) => ({ sent: acc.sent + r.sent, invalidTokens: [...acc.invalidTokens, ...r.invalidTokens] }),
      { sent: 0, invalidTokens: [] },
    );
  }
}
