// @plm SRS-019  로컬 디스크 스토리지 (dev 기본). 업로드를 MEDIA_DIR에 저장, /media/file/:key로 서브. ADR-016.
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { StorageProvider, StoredObject } from './storage-provider';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private readonly dir: string;
  private readonly publicUrl: string;

  constructor(config: ConfigService) {
    this.dir = resolve(config.get<string>('MEDIA_DIR', 'uploads'));
    // 미디어 URL 베이스(글로벌 프리픽스 /api 포함). 실기기/CDN 전환 시 교체.
    this.publicUrl = config.get<string>('MEDIA_PUBLIC_URL', 'http://localhost:3000/api');
    mkdirSync(this.dir, { recursive: true });
  }

  async save(data: Buffer, contentType: string): Promise<StoredObject> {
    const ext = EXT[contentType] ?? 'bin';
    const key = `${randomBytes(16).toString('hex')}.${ext}`;
    writeFileSync(join(this.dir, key), data);
    return { key, url: `${this.publicUrl}/media/file/${key}`, bytes: data.length };
  }

  resolvePath(key: string): string {
    // 경로 이탈 방지 — key는 파일명 문자만 허용.
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, '');
    return join(this.dir, safe);
  }
}
