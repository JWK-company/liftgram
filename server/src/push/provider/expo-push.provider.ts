import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PushMessage, PushProvider, PushSendResult, PushTarget } from './push-provider';

// Expo 푸시 드롭인 (config PUSH_PROVIDER=expo). Expo Push API는 서버 키 불필요 —
// 클라이언트의 ExpoPushToken으로 바로 발송. DeviceNotRegistered 티켓은 무효 토큰으로 반환(정리).
interface ExpoTicket {
  status?: string;
  details?: { error?: string };
}
@Injectable()
export class ExpoPushProvider implements PushProvider {
  readonly name = 'expo';
  private readonly url: string;
  constructor(config: ConfigService) {
    this.url = config.get<string>('EXPO_PUSH_URL', 'https://exp.host/--/api/v2/push/send');
  }
  async send(targets: PushTarget[], message: PushMessage): Promise<PushSendResult> {
    const expo = targets.filter((t) => t.platform === 'expo');
    if (expo.length === 0) return { sent: 0, invalidTokens: [] };
    const body = expo.map((t) => ({
      to: t.token,
      title: message.title,
      body: message.body,
      data: message.data ?? {},
    }));
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { sent: 0, invalidTokens: [] };
    const json = (await res.json()) as { data?: ExpoTicket[] };
    const tickets = Array.isArray(json.data) ? json.data : [];
    const invalidTokens: string[] = [];
    let sent = 0;
    tickets.forEach((ticket, i) => {
      if (ticket?.status === 'ok') sent += 1;
      else if (ticket?.details?.error === 'DeviceNotRegistered' && expo[i]) invalidTokens.push(expo[i].token);
    });
    return { sent, invalidTokens };
  }
}
