// @plm SRS-006  오프라인-우선 동기 (ADR-002 · SAD-004) — 엔티티별 last-write-wins.
// 클라이언트(WatermelonDB)가 로컬 변경을 push, 서버 변경을 pull. 충돌은 version 기준 해소.
// Phase 0 도메인은 payload(JSON) 불투명 보관(스키마 권위=클라이언트), 추후 서버 정규화.
import { Injectable } from '@nestjs/common';
import { Prisma, SyncRecord } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SyncChange } from './dto/sync.dto';

export interface PullResult {
  serverTime: string;
  records: SyncRecord[];
}

export interface PushResult {
  applied: number;
  skipped: number;
  serverTime: string;
}

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  // pull: 마지막 동기 시점(since) 이후 변경분.
  async pull(userId: string, since?: Date): Promise<PullResult> {
    const records = await this.prisma.syncRecord.findMany({
      where: { userId, ...(since ? { updatedAt: { gt: since } } : {}) },
      orderBy: { updatedAt: 'asc' },
    });
    return { serverTime: new Date().toISOString(), records };
  }

  // push: 클라이언트 변경분 upsert. 충돌(ADR-002): 서버 version이 더 크면 클라이언트 변경 무시.
  async push(userId: string, changes: SyncChange[]): Promise<PushResult> {
    let applied = 0;
    let skipped = 0;
    for (const ch of changes) {
      const where = {
        userId_collection_recordId: { userId, collection: ch.collection, recordId: ch.recordId },
      };
      const existing = await this.prisma.syncRecord.findUnique({ where });
      if (existing && existing.version > ch.version) {
        skipped += 1;
        continue;
      }
      const payload = ch.payload as Prisma.InputJsonValue;
      await this.prisma.syncRecord.upsert({
        where,
        create: {
          userId,
          collection: ch.collection,
          recordId: ch.recordId,
          payload,
          version: ch.version,
          deleted: ch.deleted ?? false,
        },
        update: { payload, version: ch.version, deleted: ch.deleted ?? false },
      });
      applied += 1;
    }
    return { applied, skipped, serverTime: new Date().toISOString() };
  }
}
