// @plm SRS-019  미디어 업로드·조회 (SAD-012). 스토리지 어댑터에 저장 위임 + MediaAsset 메타 기록.
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { MediaAsset } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider } from './storage/storage-provider';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export interface MediaView {
  id: string;
  url: string;
  kind: string;
  contentType: string;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async upload(ownerId: string, file?: Express.Multer.File): Promise<MediaView> {
    if (!file) throw new BadRequestException('no file uploaded (field "file")');
    if (!ALLOWED.has(file.mimetype)) throw new BadRequestException(`unsupported type: ${file.mimetype}`);
    const stored = await this.storage.save(file.buffer, file.mimetype);
    const asset = await this.prisma.mediaAsset.create({
      data: {
        ownerId,
        key: stored.key,
        url: stored.url,
        contentType: file.mimetype,
        kind: 'image',
        bytes: stored.bytes,
      },
    });
    return { id: asset.id, url: asset.url, kind: asset.kind, contentType: asset.contentType };
  }

  async findByKey(key: string): Promise<MediaAsset> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { key } });
    if (!asset) throw new NotFoundException('media not found');
    return asset;
  }

  resolvePath(key: string): string {
    return this.storage.resolvePath(key);
  }
}
