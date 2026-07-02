import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import type { PushMessage, PushProvider, PushSendResult, PushTarget } from './push-provider';
import { isAllowedPushEndpoint, parseWebSubscription } from './web-push.util';

// 웹 푸시 (VAPID) 실연동 (SRS-020 · ADR-015). platform=web 타겟의 token은 PushSubscription JSON.
// VAPID 키 미설정 시 비활성(no-op). 엔드포인트는 등록 시 검증되나 발송 시에도 방어적 재검증(SSRF).
// 불량/비허용/만료(403·404·410) 구독은 무효 토큰으로 반환(정리).
@Injectable()
export class WebPushProvider implements PushProvider {
  readonly name = 'web-push';
  private readonly enabled: boolean;
  private readonly extraHosts: string[];

  constructor(config: ConfigService) {
    const pub = config.get<string>('VAPID_PUBLIC_KEY');
    const priv = config.get<string>('VAPID_PRIVATE_KEY');
    const subject = config.get<string>('VAPID_SUBJECT', 'mailto:admin@liftgram.app');
    this.enabled = Boolean(pub && priv);
    if (this.enabled) webpush.setVapidDetails(subject, pub as string, priv as string);
    this.extraHosts = (config.get<string>('WEB_PUSH_EXTRA_HOSTS', '') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async send(targets: PushTarget[], message: PushMessage): Promise<PushSendResult> {
    const web = targets.filter((t) => t.platform === 'web');
    if (!this.enabled || web.length === 0) return { sent: 0, invalidTokens: [] };
    const payload = JSON.stringify({ title: message.title, body: message.body, data: message.data ?? {} });
    const invalidTokens: string[] = [];
    let sent = 0;
    await Promise.all(
      web.map(async (t) => {
        const sub = parseWebSubscription(t.token);
        if (!sub || !isAllowedPushEndpoint(sub.endpoint, this.extraHosts)) {
          invalidTokens.push(t.token); // 불량/비허용 엔드포인트 → 정리(SSRF 방어)
          return;
        }
        try {
          await webpush.sendNotification(sub as unknown as webpush.PushSubscription, payload);
          sent += 1;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 403 || code === 404 || code === 410) invalidTokens.push(t.token); // 만료·키불일치·해지
        }
      }),
    );
    return { sent, invalidTokens };
  }
}
