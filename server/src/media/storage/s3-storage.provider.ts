// @plm SRS-019  S3 호환 클라우드 스토리지 (Cloudflare R2 · AWS S3 · Supabase Storage). SAD-012 · ADR-016.
// 서버 프록시 모델 유지 — save는 상대경로(/media/file/:key) 반환, 서브는 getStream으로 R2에서 스트림.
// 이래야 재배포에도 사진이 유지되면서(영속 스토리지) 모더레이션(flagged→404)·capability URL 그대로.
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Readable } from 'stream';
import { StorageProvider, StoredObject } from './storage-provider';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

@Injectable()
export class S3StorageProvider implements StorageProvider {
  readonly name = 's3';
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.client = new S3Client({
      region: config.get<string>('S3_REGION', 'auto'), // R2는 'auto'
      endpoint: config.getOrThrow<string>('S3_ENDPOINT'), // R2: https://<account>.r2.cloudflarestorage.com
      forcePathStyle: true, // R2/호환 스토리지 안정성
      credentials: {
        accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
      },
    });
  }

  async save(data: Buffer, contentType: string): Promise<StoredObject> {
    const ext = EXT[contentType] ?? 'bin';
    const key = `${randomBytes(16).toString('hex')}.${ext}`;
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: contentType }),
    );
    // 로컬과 동일한 상대경로 — 서버가 /media/file/:key로 프록시 서브(호스트 비종속).
    return { key, url: `/media/file/${key}`, bytes: data.length };
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false; // 없음/권한 오류 → 깨끗한 404로 이어짐
    }
  }

  async getStream(key: string): Promise<Readable> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return res.Body as Readable;
  }
}
