// @plm SRS-019  로컬 디스크 스토리지 (dev 기본). 업로드를 MEDIA_DIR에 저장, /media/file/:key로 서브. ADR-016.
// URL은 호스트 없는 상대경로(`/media/file/<key>`)로 반환 — 관계형 행에 호스트를 굳히지 않아 실기기/CDN 전환에 안전.
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import type { Readable } from 'stream';
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

  constructor(config: ConfigService) {
    this.dir = resolve(config.get<string>('MEDIA_DIR', 'uploads'));
    mkdirSync(this.dir, { recursive: true });
  }

  async save(data: Buffer, contentType: string): Promise<StoredObject> {
    const ext = EXT[contentType] ?? 'bin';
    const key = `${randomBytes(16).toString('hex')}.${ext}`;
    writeFileSync(join(this.dir, key), data);
    // 상대경로 — 클라이언트가 SERVER_URL로 해소. (클라우드 어댑터는 절대 CDN URL 반환)
    return { key, url: `/media/file/${key}`, bytes: data.length };
  }

  private pathFor(key: string): string {
    // 경로 이탈 방지 — key는 파일명 문자만 허용.
    const safe = key.replace(/[^a-zA-Z0-9._-]/g, '');
    return join(this.dir, safe);
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(this.pathFor(key));
  }

  async getStream(key: string): Promise<Readable> {
    return createReadStream(this.pathFor(key));
  }
}
