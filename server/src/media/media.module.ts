import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { STORAGE_PROVIDER, type StorageProvider } from './storage/storage-provider';
import { LocalStorageProvider } from './storage/local-storage.provider';
import { S3StorageProvider } from './storage/s3-storage.provider';
import { IMAGE_SCANNER, type ImageScanner } from './scanner/image-scanner';
import { NoopImageScanner } from './scanner/noop-scanner';

// 미디어 파이프라인 (SAD-012). 스토리지 어댑터 — config STORAGE_PROVIDER로 선택(기본 local).
// 클라우드(S3/R2/Supabase) 추가 시: 어댑터 클래스 작성 → providers 등록 → switch에 case 추가(ADR-016).
// 이미지 자동 스캔 어댑터 — config IMAGE_SCANNER로 선택(기본 noop). 클라우드 스캔(Rekognition/Hive)은 드롭인.
@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    NoopImageScanner,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      // 선택된 어댑터만 생성 — R2 모드는 로컬 디스크(uploads/)를 안 건드리고, 로컬 모드는 S3 env 불필요.
      useFactory: (config: ConfigService): StorageProvider => {
        const name = config.get<string>('STORAGE_PROVIDER', 'local');
        switch (name) {
          // 클라우드(Cloudflare R2·AWS S3·Supabase).
          case 's3':
          case 'r2':
            return new S3StorageProvider(config);
          case 'local':
          default:
            return new LocalStorageProvider(config);
        }
      },
    },
    {
      provide: IMAGE_SCANNER,
      inject: [ConfigService, NoopImageScanner],
      useFactory: (config: ConfigService, noop: NoopImageScanner): ImageScanner => {
        const name = config.get<string>('IMAGE_SCANNER', 'noop');
        switch (name) {
          // case 'rekognition': return rekognition;  // 클라우드 스캔 드롭인 지점(ADR-016)
          case 'noop':
          default:
            return noop;
        }
      },
    },
  ],
})
export class MediaModule {}
