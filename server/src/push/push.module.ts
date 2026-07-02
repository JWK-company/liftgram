import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { PUSH_PROVIDER, type PushProvider } from './provider/push-provider';
import { NoopPushProvider } from './provider/noop-push.provider';
import { ExpoPushProvider } from './provider/expo-push.provider';
import { WebPushProvider } from './provider/web-push.provider';
import { MemoryPushProvider } from './provider/memory-push.provider';
import { CompositePushProvider } from './provider/composite-push.provider';

// 푸시 알림 (SRS-020 · ADR-015). PrismaModule은 @Global. PushService를 export해 social/dm이 디스패치.
// 기본 provider=composite(플랫폼 라우팅: expo→Expo, web→WebPush/VAPID). config PUSH_PROVIDER로 강제 선택 가능.
@Module({
  controllers: [PushController],
  providers: [
    PushService,
    NoopPushProvider,
    ExpoPushProvider,
    WebPushProvider,
    MemoryPushProvider,
    CompositePushProvider,
    {
      provide: PUSH_PROVIDER,
      inject: [ConfigService, NoopPushProvider, ExpoPushProvider, MemoryPushProvider, CompositePushProvider],
      useFactory: (
        config: ConfigService,
        noop: NoopPushProvider,
        expo: ExpoPushProvider,
        memory: MemoryPushProvider,
        composite: CompositePushProvider,
      ): PushProvider => {
        switch (config.get<string>('PUSH_PROVIDER', 'auto')) {
          case 'noop':
            return noop;
          case 'expo':
            return expo;
          case 'memory':
            return memory;
          case 'auto':
          case 'composite':
          default:
            return composite;
        }
      },
    },
  ],
  exports: [PushService],
})
export class PushModule {}
