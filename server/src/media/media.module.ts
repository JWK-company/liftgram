import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { STORAGE_PROVIDER, type StorageProvider } from './storage/storage-provider';
import { LocalStorageProvider } from './storage/local-storage.provider';

// 미디어 파이프라인 (SAD-012). 스토리지 어댑터 — config STORAGE_PROVIDER로 선택(기본 local).
// 클라우드(S3/R2/Supabase) 추가 시: 어댑터 클래스 작성 → providers 등록 → switch에 case 추가(ADR-016).
@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    LocalStorageProvider,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService, LocalStorageProvider],
      useFactory: (config: ConfigService, local: LocalStorageProvider): StorageProvider => {
        const name = config.get<string>('STORAGE_PROVIDER', 'local');
        switch (name) {
          // case 's3': return s3;   // 클라우드 드롭인 지점
          case 'local':
          default:
            return local;
        }
      },
    },
  ],
})
export class MediaModule {}
