import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { PUSH_PROVIDER, type PushProvider } from './provider/push-provider';
import { NoopPushProvider } from './provider/noop-push.provider';
import { ExpoPushProvider } from './provider/expo-push.provider';
import { MemoryPushProvider } from './provider/memory-push.provider';

// 푸시 알림 (SRS-020 · ADR-015). PrismaModule은 @Global. PushService를 export해 social/dm이 디스패치.
// 발송 어댑터 — config PUSH_PROVIDER로 선택(기본 noop). Expo는 서버 키 불필요한 실동작 드롭인.
@Module({
  controllers: [PushController],
  providers: [
    PushService,
    NoopPushProvider,
    ExpoPushProvider,
    MemoryPushProvider,
    {
      provide: PUSH_PROVIDER,
      inject: [ConfigService, NoopPushProvider, ExpoPushProvider, MemoryPushProvider],
      useFactory: (
        config: ConfigService,
        noop: NoopPushProvider,
        expo: ExpoPushProvider,
        memory: MemoryPushProvider,
      ): PushProvider => {
        switch (config.get<string>('PUSH_PROVIDER', 'noop')) {
          case 'expo':
            return expo;
          case 'memory':
            return memory;
          case 'noop':
          default:
            return noop;
        }
      },
    },
  ],
  exports: [PushService],
})
export class PushModule {}
