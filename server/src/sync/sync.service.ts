// @plm SRS-006  WatermelonDB 동기 프로토콜 (ADR-002 · SAD-004) — 엔티티별 last-write-wins.
// pull: lastPulledAt 이후 변경분을 테이블별 created/updated/deleted로. push: 클라이언트 변경분 upsert.
// Phase 0 도메인은 payload(raw record JSON) 불투명 보관 — 스키마 권위=클라이언트(WatermelonDB).
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RawRecord, SyncChanges } from './dto/sync.dto';

export interface PullResult {
  changes: SyncChanges;
  timestamp: number; // 다음 lastPulledAt
}

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  async pull(userId: string, lastPulledAt: number): Promise<PullResult> {
    const timestamp = Date.now();
    const since = lastPulledAt ? new Date(lastPulledAt) : new Date(0);
    const recs = await this.prisma.syncRecord.findMany({
      where: { userId, updatedAt: { gt: since } },
    });
    const changes: SyncChanges = {};
    for (const r of recs) {
      const table = (changes[r.collection] ??= { created: [], updated: [], deleted: [] });
      // 권장 패턴(WatermelonDB Backend 문서): 비삭제는 전부 updated로 — 클라이언트는
      // sendCreatedAsUpdated:true로 미존재 레코드를 생성·경고 억제. "이미 존재" 에러 회피.
      if (r.deleted) table.deleted.push(r.recordId);
      else table.updated.push(r.payload as RawRecord);
    }
    return { changes, timestamp };
  }

  // last-write-wins(슬라이스): 클라이언트는 pull 후 push하므로 충돌 드묾. 충돌 정교화는 후속.
  async push(userId: string, changes: SyncChanges): Promise<void> {
    for (const [collection, table] of Object.entries(changes)) {
      for (const rec of [...(table.created ?? []), ...(table.updated ?? [])]) {
        const where = {
          userId_collection_recordId: { userId, collection, recordId: rec.id },
        };
        const payload = rec as Prisma.InputJsonValue;
        await this.prisma.syncRecord.upsert({
          where,
          create: { userId, collection, recordId: rec.id, payload, deleted: false },
          update: { payload, deleted: false },
        });
      }
      for (const id of table.deleted ?? []) {
        const where = { userId_collection_recordId: { userId, collection, recordId: id } };
        await this.prisma.syncRecord.upsert({
          where,
          create: { userId, collection, recordId: id, payload: {}, deleted: true },
          update: { deleted: true },
        });
      }
    }
  }
}
